import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
// Enums live in the database so invalid values can never be stored, whatever the API layer does.
export const roleEnum = pgEnum('role', ['author', 'admin']);
export const ticketStatusEnum = pgEnum('ticket_status', ['open', 'in_progress', 'resolved', 'closed']);
export const ticketCategoryEnum = pgEnum('ticket_category', [
  'royalty_payments',
  'isbn_metadata',
  'printing_quality',
  'distribution_availability',
  'book_status_production',
  'general_inquiry',
]);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['critical', 'high', 'medium', 'low']);
// Where a ticket's category/priority came from — lets the UI show "AI", "Rules" (AI unavailable) or "Admin override".
export const triageSourceEnum = pgEnum('triage_source', ['ai', 'rules', 'admin']);
export const aiStatusEnum = pgEnum('ai_status', ['pending', 'done', 'fallback']);
export const aiPurposeEnum = pgEnum('ai_purpose', ['triage', 'draft']);
export const aiCallStatusEnum = pgEnum('ai_call_status', ['ok', 'error', 'skipped']);

// ---------- Tables ----------
// One users table for both roles. Author profile fields are nullable for admins.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  authorCode: text('author_code').unique(), // e.g. AUTH001 from the source dataset
  phone: text('phone'),
  city: text('city'),
  joinedDate: date('joined_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const books = pgTable(
  'books',
  {
    id: text('id').primaryKey(), // BK001… kept from the dataset so support staff can reference it
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isbn: text('isbn').notNull(),
    genre: text('genre').notNull(),
    publicationDate: date('publication_date'), // null while the book is still in production
    status: text('status').notNull(), // e.g. "Published & Live", "In Production - Cover Design"
    // MRP and per-copy royalty are decided late in production, so they're null for books not yet published.
    mrp: integer('mrp'),
    royaltyPerCopy: integer('royalty_per_copy'),
    copiesSold: integer('copies_sold').notNull().default(0),
    royaltyEarned: integer('royalty_earned').notNull().default(0),
    royaltyPaid: integer('royalty_paid').notNull().default(0),
    royaltyPending: integer('royalty_pending').notNull().default(0),
    lastPayoutDate: date('last_payout_date'),
    printPartner: text('print_partner'),
    availableOn: text('available_on').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [index('books_author_idx').on(t.authorId)],
);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Human-friendly reference shown to authors and staff ("#1042")
    number: serial('number').notNull().unique(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookId: text('book_id').references(() => books.id, { onDelete: 'set null' }), // null = general / account level
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    attachmentName: text('attachment_name'),
    status: ticketStatusEnum('status').notNull().default('open'),
    category: ticketCategoryEnum('category'),
    categorySource: triageSourceEnum('category_source'),
    priority: ticketPriorityEnum('priority'),
    prioritySource: triageSourceEnum('priority_source'),
    aiStatus: aiStatusEnum('ai_status').notNull().default('pending'),
    aiReasoning: text('ai_reasoning'), // one-line explanation of the triage decision, shown to admins
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('tickets_author_idx').on(t.authorId),
    index('tickets_queue_idx').on(t.status, t.priority, t.createdAt),
  ],
);

// The conversation visible to the author (author follow-ups and admin responses).
export const ticketMessages = pgTable(
  'ticket_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    senderRole: roleEnum('sender_role').notNull(),
    body: text('body').notNull(),
    // True when an admin sent a reply that started from the AI draft — useful to measure AI adoption.
    aiAssisted: boolean('ai_assisted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ticket_messages_ticket_idx').on(t.ticketId, t.createdAt)],
);

// Staff-only notes. A separate table (not a flag on messages) so an internal note can never leak
// into the author-facing API by a forgotten filter.
export const internalNotes = pgTable(
  'internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id') // the admin who wrote the note
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('internal_notes_ticket_idx').on(t.ticketId)],
);

// Latest AI draft per ticket (cached so re-opening a ticket doesn't pay for a new generation).
export const aiDrafts = pgTable('ai_drafts', {
  ticketId: uuid('ticket_id')
    .primaryKey()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  model: text('model').notNull(),
  kbSections: text('kb_sections').array().notNull(),
  // Number of author-visible messages when the draft was generated — if the thread grew, the draft is stale.
  basedOnMessageCount: integer('based_on_message_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Every model call is logged with token usage and latency: the evidence for cost awareness,
// and the data an ops dashboard needs to spot failures.
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    purpose: aiPurposeEnum('purpose').notNull(),
    model: text('model').notNull(),
    status: aiCallStatusEnum('status').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_calls_created_idx').on(t.createdAt)],
);

// ---------- Relations (for typed relational queries) ----------
export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  tickets: many(tickets, { relationName: 'ticketAuthor' }),
}));

export const booksRelations = relations(books, ({ one }) => ({
  author: one(users, { fields: [books.authorId], references: [users.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  author: one(users, { fields: [tickets.authorId], references: [users.id], relationName: 'ticketAuthor' }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id], relationName: 'ticketAssignee' }),
  book: one(books, { fields: [tickets.bookId], references: [books.id] }),
  messages: many(ticketMessages),
  notes: many(internalNotes),
  draft: one(aiDrafts, { fields: [tickets.id], references: [aiDrafts.ticketId] }),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketMessages.ticketId], references: [tickets.id] }),
  sender: one(users, { fields: [ticketMessages.senderId], references: [users.id] }),
}));

export const internalNotesRelations = relations(internalNotes, ({ one }) => ({
  ticket: one(tickets, { fields: [internalNotes.ticketId], references: [tickets.id] }),
  admin: one(users, { fields: [internalNotes.authorId], references: [users.id] }),
}));

export const aiDraftsRelations = relations(aiDrafts, ({ one }) => ({
  ticket: one(tickets, { fields: [aiDrafts.ticketId], references: [tickets.id] }),
}));

export type User = typeof users.$inferSelect;
export type Book = typeof books.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type TicketCategory = (typeof ticketCategoryEnum.enumValues)[number];
export type TicketPriority = (typeof ticketPriorityEnum.enumValues)[number];
export type TicketStatus = (typeof ticketStatusEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
