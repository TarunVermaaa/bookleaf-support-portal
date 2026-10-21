import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { SessionUser } from '../../auth/session.js';
import { draftReply } from '../../ai/draft.js';
import { AiUnavailableError, aiConfigured } from '../../ai/llm.js';
import { triageTicket } from '../../ai/triage.js';
import { db } from '../../db/client.js';
import {
  aiDrafts,
  books,
  internalNotes,
  ticketMessages,
  tickets,
  users,
  type Ticket,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '../../db/schema.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { publish } from '../../realtime/events.js';
import type { CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from './tickets.schemas.js';

// ---------- Serialization ----------
// API responses are explicit DTOs (never raw rows), so adding a column can't accidentally expose it.
type TicketRow = Ticket & {
  bookTitle: string | null;
  authorName: string;
  authorEmail: string;
  assigneeName: string | null;
  messageCount?: number;
  lastMessageAt?: Date | null;
};

function toTicketDto(row: TicketRow, viewer: SessionUser) {
  const isAdmin = viewer.role === 'admin';
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    description: row.description,
    status: row.status,
    book: row.bookId ? { id: row.bookId, title: row.bookTitle } : null,
    attachmentName: row.attachmentName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    firstResponseAt: row.firstResponseAt,
    resolvedAt: row.resolvedAt,
    messageCount: row.messageCount ?? 0,
    lastMessageAt: row.lastMessageAt ?? null,
    // Triage and assignment are internal operations data — admins only.
    ...(isAdmin
      ? {
          author: { id: row.authorId, name: row.authorName, email: row.authorEmail },
          category: row.category,
          categorySource: row.categorySource,
          priority: row.priority,
          prioritySource: row.prioritySource,
          aiStatus: row.aiStatus,
          aiReasoning: row.aiReasoning,
          assignee: row.assigneeId ? { id: row.assigneeId, name: row.assigneeName } : null,
        }
      : {}),
  };
}

const assignee = sql<string | null>`(select name from users a where a.id = ${tickets.assigneeId})`;
const messageCount = sql<number>`(select count(*)::int from ticket_messages m where m.ticket_id = ${tickets.id})`;
const lastMessageAt = sql<Date | null>`(select max(created_at) from ticket_messages m where m.ticket_id = ${tickets.id})`;

function baseTicketQuery() {
  return db
    .select({
      ticket: tickets,
      bookTitle: books.title,
      authorName: users.name,
      authorEmail: users.email,
      assigneeName: assignee,
      messageCount,
      lastMessageAt,
    })
    .from(tickets)
    .innerJoin(users, eq(users.id, tickets.authorId))
    .leftJoin(books, eq(books.id, tickets.bookId));
}

type BaseRow = Awaited<ReturnType<ReturnType<typeof baseTicketQuery>['execute']>>[number];
const flatten = (r: BaseRow): TicketRow => ({
  ...r.ticket,
  bookTitle: r.bookTitle,
  authorName: r.authorName,
  authorEmail: r.authorEmail,
  assigneeName: r.assigneeName,
  messageCount: r.messageCount,
  lastMessageAt: r.lastMessageAt,
});

/** Loads a ticket the viewer is allowed to see. Authors get 404 (not 403) for other authors' tickets, so ids can't be probed. */
async function loadTicketFor(viewer: SessionUser, id: string): Promise<TicketRow> {
  const where = viewer.role === 'admin' ? eq(tickets.id, id) : and(eq(tickets.id, id), eq(tickets.authorId, viewer.id));
  const [row] = await baseTicketQuery().where(where).limit(1);
  if (!row) throw ApiError.notFound('Ticket');
  return flatten(row);
}

// ---------- Create + triage ----------
export async function createTicket(author: SessionUser, input: CreateTicketInput) {
  if (input.bookId) {
    const [book] = await db.select({ id: books.id }).from(books).where(and(eq(books.id, input.bookId), eq(books.authorId, author.id)));
    if (!book) throw ApiError.badRequest('Some fields are invalid', [{ field: 'bookId', message: 'This book is not in your account' }]);
  }
  const [created] = await db
    .insert(tickets)
    .values({
      authorId: author.id,
      bookId: input.bookId ?? null,
      subject: input.subject,
      description: input.description,
      attachmentName: input.attachmentName ?? null,
    })
    .returning();

  publish({ type: 'ticket.created', ticketId: created.id, authorId: author.id });

  // Triage runs in the background: the author gets an instant response and the ticket exists even if the
  // AI is slow or down. When triage finishes, admins are notified over SSE.
  void runTriage(created.id).catch((err) => logger.error('Background triage failed', { ticketId: created.id, error: String(err) }));

  return toTicketDto(await loadTicketFor(author, created.id), author);
}

/** (Re)classifies a ticket. Admin overrides are respected — the AI never overwrites a human decision. */
export async function runTriage(ticketId: string, opts: { force?: boolean } = {}) {
  const [row] = await db
    .select({ ticket: tickets, book: books })
    .from(tickets)
    .leftJoin(books, eq(books.id, tickets.bookId))
    .where(eq(tickets.id, ticketId));
  if (!row) throw ApiError.notFound('Ticket');
  const { ticket, book } = row;

  const result = await triageTicket(ticket, book);
  const keepCategory = ticket.categorySource === 'admin' && !opts.force;
  const keepPriority = ticket.prioritySource === 'admin' && !opts.force;

  await db
    .update(tickets)
    .set({
      category: keepCategory ? ticket.category : result.category,
      categorySource: keepCategory ? 'admin' : result.source,
      priority: keepPriority ? ticket.priority : result.priority,
      prioritySource: keepPriority ? 'admin' : result.source,
      aiReasoning: result.reasoning,
      aiStatus: result.source === 'ai' ? 'done' : 'fallback',
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticketId));

  publish({ type: 'ticket.updated', ticketId, authorId: ticket.authorId });
  return result;
}

// ---------- List ----------
const PRIORITY_ORDER = sql`case ${tickets.priority} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`;
const ACTIVE_FIRST = sql`case when ${tickets.status} in ('open', 'in_progress') then 0 else 1 end`;

export async function listTickets(viewer: SessionUser, q: ListTicketsQuery) {
  const filters: SQL[] = [];
  if (viewer.role === 'author') filters.push(eq(tickets.authorId, viewer.id));
  if (q.status?.length) filters.push(inArray(tickets.status, q.status));
  if (viewer.role === 'admin') {
    if (q.category?.length) filters.push(inArray(tickets.category, q.category));
    if (q.priority?.length) filters.push(inArray(tickets.priority, q.priority));
    if (q.assignee === 'me') filters.push(eq(tickets.assigneeId, viewer.id));
    if (q.assignee === 'unassigned') filters.push(sql`${tickets.assigneeId} is null`);
    if (q.authorId) filters.push(eq(tickets.authorId, q.authorId));
  }
  if (q.from) filters.push(gte(tickets.createdAt, q.from));
  if (q.to) filters.push(lte(tickets.createdAt, q.to));
  if (q.search) {
    const term = `%${q.search}%`;
    const numeric = Number(q.search.replace(/^#/, ''));
    filters.push(
      or(
        ilike(tickets.subject, term),
        ilike(tickets.description, term),
        ilike(users.name, term),
        ...(Number.isInteger(numeric) ? [eq(tickets.number, numeric)] : []),
      )!,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  // "urgency" (admin default): active tickets first, then critical → low, then oldest first —
  // so the most urgent, longest-waiting tickets are at the top of the queue.
  const order =
    q.sort === 'urgency'
      ? [ACTIVE_FIRST, PRIORITY_ORDER, asc(tickets.createdAt)]
      : q.sort === 'oldest'
        ? [asc(tickets.createdAt)]
        : [desc(tickets.createdAt)];

  const [rows, [{ total }]] = await Promise.all([
    baseTicketQuery()
      .where(where)
      .orderBy(...order)
      .limit(q.limit)
      .offset(q.offset),
    db.select({ total: count() }).from(tickets).innerJoin(users, eq(users.id, tickets.authorId)).where(where),
  ]);

  return { items: rows.map((r) => toTicketDto(flatten(r), viewer)), total, limit: q.limit, offset: q.offset };
}

// ---------- Detail ----------
export async function getTicket(viewer: SessionUser, id: string) {
  const row = await loadTicketFor(viewer, id);
  const messages = await db
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      senderRole: ticketMessages.senderRole,
      senderName: users.name,
      aiAssisted: ticketMessages.aiAssisted,
      createdAt: ticketMessages.createdAt,
    })
    .from(ticketMessages)
    .innerJoin(users, eq(users.id, ticketMessages.senderId))
    .where(eq(ticketMessages.ticketId, id))
    .orderBy(asc(ticketMessages.createdAt));

  const base = {
    ...toTicketDto(row, viewer),
    // Authors see "BookLeaf Support" rather than individual staff names; aiAssisted is internal.
    messages: messages.map((m) =>
      viewer.role === 'admin'
        ? m
        : { id: m.id, body: m.body, senderRole: m.senderRole, senderName: m.senderRole === 'admin' ? 'BookLeaf Support' : m.senderName, createdAt: m.createdAt },
    ),
  };
  if (viewer.role !== 'admin') return base;

  const notes = await db
    .select({ id: internalNotes.id, body: internalNotes.body, adminName: users.name, createdAt: internalNotes.createdAt })
    .from(internalNotes)
    .innerJoin(users, eq(users.id, internalNotes.authorId))
    .where(eq(internalNotes.ticketId, id))
    .orderBy(asc(internalNotes.createdAt));
  return { ...base, notes };
}

// ---------- Messages ----------
export async function addMessage(viewer: SessionUser, id: string, input: { body: string; aiAssisted?: boolean }) {
  const ticket = await loadTicketFor(viewer, id);
  if (ticket.status === 'closed') throw ApiError.conflict('This ticket is closed. Please open a new ticket.');

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(ticketMessages).values({
      ticketId: id,
      senderId: viewer.id,
      senderRole: viewer.role,
      body: input.body,
      aiAssisted: viewer.role === 'admin' && Boolean(input.aiAssisted),
    });
    const patch: Partial<Ticket> = { updatedAt: now };
    if (viewer.role === 'admin') {
      if (!ticket.firstResponseAt) patch.firstResponseAt = now;
      if (ticket.status === 'open') patch.status = 'in_progress';
    } else if (ticket.status === 'resolved') {
      // An author replying to a resolved ticket means it isn't resolved — reopen it.
      patch.status = 'open';
      patch.resolvedAt = null;
    }
    await tx.update(tickets).set(patch).where(eq(tickets.id, id));
  });

  publish({ type: 'ticket.message', ticketId: id, authorId: ticket.authorId });
  return getTicket(viewer, id);
}

// ---------- Admin actions ----------
export async function updateTicket(admin: SessionUser, id: string, input: UpdateTicketInput) {
  const ticket = await loadTicketFor(admin, id);
  const patch: Partial<Ticket> = { updatedAt: new Date() };

  if (input.status && input.status !== ticket.status) {
    patch.status = input.status;
    patch.resolvedAt = input.status === 'resolved' || input.status === 'closed' ? new Date() : null;
  }
  // Overrides are recorded as "admin" so a later re-triage won't silently undo them.
  if (input.category && input.category !== ticket.category) {
    patch.category = input.category;
    patch.categorySource = 'admin';
  }
  if (input.priority && input.priority !== ticket.priority) {
    patch.priority = input.priority;
    patch.prioritySource = 'admin';
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId) {
      const [admin2] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.assigneeId), eq(users.role, 'admin')));
      if (!admin2) throw ApiError.badRequest('Some fields are invalid', [{ field: 'assigneeId', message: 'Assignee must be an admin' }]);
    }
    patch.assigneeId = input.assigneeId;
  }

  await db.update(tickets).set(patch).where(eq(tickets.id, id));
  publish({ type: 'ticket.updated', ticketId: id, authorId: ticket.authorId });
  return getTicket(admin, id);
}

export async function addNote(admin: SessionUser, id: string, body: string) {
  const ticket = await loadTicketFor(admin, id);
  await db.insert(internalNotes).values({ ticketId: id, authorId: admin.id, body });
  // Notes are internal: only admins are notified (authorId '' never matches a real author).
  publish({ type: 'ticket.updated', ticketId: ticket.id, authorId: '' });
  return getTicket(admin, id);
}

// ---------- AI draft ----------
export async function getDraft(admin: SessionUser, id: string, opts: { regenerate: boolean }) {
  const ticket = await loadTicketFor(admin, id);
  const messageTotal = ticket.messageCount ?? 0;

  if (!opts.regenerate) {
    const [cached] = await db.select().from(aiDrafts).where(eq(aiDrafts.ticketId, id));
    // Reuse the stored draft unless the conversation moved on since it was written.
    if (cached && cached.basedOnMessageCount === messageTotal) {
      return { available: true as const, cached: true, body: cached.body, model: cached.model, kbSections: cached.kbSections, createdAt: cached.createdAt };
    }
  }
  if (!aiConfigured()) {
    return { available: false as const, reason: 'AI drafting is not configured. Please write the reply manually.' };
  }

  // A draft needs a category to pick the right knowledge; if triage hasn't finished yet, run it now.
  let { category, priority } = ticket;
  if (!category || !priority) {
    const result = await runTriage(id);
    category = result.category;
    priority = result.priority;
  }

  const [book] = ticket.bookId ? await db.select().from(books).where(eq(books.id, ticket.bookId)) : [null];
  const [author] = await db.select({ name: users.name, joinedDate: users.joinedDate }).from(users).where(eq(users.id, ticket.authorId));
  const thread = await db
    .select({ role: ticketMessages.senderRole, body: ticketMessages.body, createdAt: ticketMessages.createdAt })
    .from(ticketMessages)
    .where(eq(ticketMessages.ticketId, id))
    .orderBy(asc(ticketMessages.createdAt));

  try {
    const draft = await draftReply({
      ticket: { ...ticket, category: category as TicketCategory, priority: priority as TicketPriority },
      author,
      book: book ?? null,
      thread,
    });
    const values = { body: draft.body, model: draft.model, kbSections: draft.kbSections, basedOnMessageCount: messageTotal, createdAt: new Date() };
    await db.insert(aiDrafts).values({ ticketId: id, ...values }).onConflictDoUpdate({ target: aiDrafts.ticketId, set: values });
    return { available: true as const, cached: false, ...values };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { available: false as const, reason: 'The AI assistant is unavailable right now. Please write the reply manually — you can retry the draft later.' };
    }
    throw err;
  }
}

export async function listAdmins() {
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.role, 'admin')).orderBy(asc(users.name));
}

export type TicketStatusValue = TicketStatus;
