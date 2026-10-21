import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { AiDraft, Book, BooksResponse, Category, Priority, Status, TicketDetail, User } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBanner, LiveDot, SourceTag, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { age, CATEGORY_LABELS, date, dateTime, inr, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/format';

export function AdminTicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [team, setTeam] = useState<Pick<User, 'id' | 'name'>[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [replyFromDraft, setReplyFromDraft] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const draftRequested = useRef(false);

  const load = useCallback(async () => {
    try {
      const t = await api.get<TicketDetail>(`/tickets/${id}`);
      setTicket(t);
      if (t.book && t.author) {
        const books = await api.get<BooksResponse>(`/books?authorId=${t.author.id}`);
        setBook(books.items.find((b) => b.id === t.book!.id) ?? null);
      } else setBook(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this ticket');
    }
  }, [id]);

  const loadDraft = useCallback(
    async (regenerate = false) => {
      setDraftLoading(true);
      try {
        const d = await api.get<AiDraft>(`/tickets/${id}/ai-draft${regenerate ? '?regenerate=true' : ''}`);
        setDraft(d);
        // Pre-fill the composer with the draft (only if the admin hasn't started typing their own reply).
        if (d.available) {
          setReply((current) => (current.trim() && !regenerate ? current : d.body));
          setReplyFromDraft(true);
        }
      } catch (e) {
        setDraft({ available: false, reason: e instanceof ApiError ? e.message : 'Could not generate a draft' });
      } finally {
        setDraftLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
    api.get<{ items: User[] }>('/admin/team').then((r) => setTeam(r.items)).catch(() => undefined);
  }, [load]);

  // When an admin opens a ticket, fetch the AI draft once (cached server-side, so reopening is free).
  useEffect(() => {
    if (ticket && !draftRequested.current && ticket.status !== 'closed') {
      draftRequested.current = true;
      void loadDraft();
    }
  }, [ticket, loadDraft]);

  const connected = useLiveUpdates((_type, ticketId) => {
    if (ticketId === id) void load();
  });

  async function patch(body: Partial<{ status: Status; category: Category; priority: Priority; assigneeId: string | null }>) {
    setBusy(true);
    try {
      setTicket(await api.patch<TicketDetail>(`/tickets/${id}`, body));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(resolve: boolean) {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      let t = await api.post<TicketDetail>(`/tickets/${id}/messages`, { body: reply, aiAssisted: replyFromDraft });
      if (resolve) t = await api.patch<TicketDetail>(`/tickets/${id}`, { status: 'resolved' });
      setTicket(t);
      setReply('');
      setReplyFromDraft(false);
      setDraft(null);
      draftRequested.current = true; // don't auto-draft again right after replying
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the reply');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      setTicket(await api.post<TicketDetail>(`/tickets/${id}/notes`, { body: note }));
      setNote('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the note');
    } finally {
      setBusy(false);
    }
  }

  async function retriage() {
    setBusy(true);
    try {
      setTicket(await api.post<TicketDetail>(`/tickets/${id}/triage`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not re-run triage');
    } finally {
      setBusy(false);
    }
  }

  if (error && !ticket) return <ErrorBanner message={error} />;
  if (!ticket) return <Spinner />;

  return (
    <section>
      <Link to="/admin" className="link small">
        ← Ticket queue
      </Link>
      <div className="page-head">
        <h1>
          <span className="muted">#{ticket.number}</span> {ticket.subject}
        </h1>
        <div className="row-right">
          <LiveDot connected={connected} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>
      <ErrorBanner message={error} />

      <div className="two-col">
        {/* ---- Conversation + reply ---- */}
        <div>
          <div className="thread">
            <div className="message author">
              <div className="meta">
                {ticket.author?.name} · {dateTime(ticket.createdAt)} ({age(ticket.createdAt)} ago)
              </div>
              <p>{ticket.description}</p>
              {ticket.attachmentName && <div className="muted small">📎 {ticket.attachmentName} (not uploaded in demo)</div>}
            </div>
            {ticket.messages.map((m) => (
              <div key={m.id} className={`message ${m.senderRole}`}>
                <div className="meta">
                  {m.senderName} · {dateTime(m.createdAt)} {m.aiAssisted && <span className="source source-ai">AI-assisted</span>}
                </div>
                <p>{m.body}</p>
              </div>
            ))}
          </div>

          {ticket.status !== 'closed' && (
            <div className="card composer">
              <div className="composer-head">
                <strong>Reply to author</strong>
                <div className="row-right">
                  {draft?.available && (
                    <span className="muted small" title={`Knowledge base: ${draft.kbSections.join(', ')}`}>
                      AI draft{draft.cached ? ' (cached)' : ''} · uses KB: {draft.kbSections.join(', ')}
                    </span>
                  )}
                  <button className="link small" disabled={draftLoading} onClick={() => loadDraft(true)}>
                    {draftLoading ? 'Drafting…' : draft?.available ? 'Regenerate draft' : 'Generate AI draft'}
                  </button>
                </div>
              </div>
              {draftLoading && !reply && <Spinner label="Drafting a reply from the knowledge base…" />}
              {draft && !draft.available && <div className="banner warn small">{draft.reason}</div>}
              <textarea
                rows={10}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply to the author (they will see it on their ticket instantly)…"
              />
              <div className="actions">
                <span className="muted small">{replyFromDraft ? 'Edited from AI draft — review before sending.' : ''}</span>
                <button className="secondary" disabled={busy || !reply.trim()} onClick={() => sendReply(false)}>
                  Send reply
                </button>
                <button className="primary" disabled={busy || !reply.trim()} onClick={() => sendReply(true)}>
                  Send & resolve
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---- Side panel: triage, management, context ---- */}
        <aside className="side">
          <div className="card">
            <h3>Triage</h3>
            <label>
              <span className="label-row">
                Category <SourceTag source={ticket.categorySource} />
              </span>
              <select
                value={ticket.category ?? ''}
                disabled={busy}
                onChange={(e) => patch({ category: e.target.value as Category })}
              >
                {!ticket.category && <option value="">Triaging…</option>}
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label-row">
                Priority <SourceTag source={ticket.prioritySource} />
              </span>
              <select value={ticket.priority ?? ''} disabled={busy} onChange={(e) => patch({ priority: e.target.value as Priority })}>
                {!ticket.priority && <option value="">Triaging…</option>}
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            {ticket.aiReasoning && <p className="muted small">Why: {ticket.aiReasoning}</p>}
            <button className="link small" disabled={busy} onClick={retriage}>
              Re-run AI triage
            </button>
          </div>

          <div className="card">
            <h3>Manage</h3>
            <label>
              Status
              <select value={ticket.status} disabled={busy} onChange={(e) => patch({ status: e.target.value as Status })}>
                {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assignee
              <select
                value={ticket.assignee?.id ?? ''}
                disabled={busy}
                onChange={(e) => patch({ assigneeId: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {team.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {ticket.assignee?.id !== user?.id && (
              <button className="secondary small" disabled={busy} onClick={() => patch({ assigneeId: user!.id })}>
                Assign to me
              </button>
            )}
          </div>

          <div className="card">
            <h3>Author & book</h3>
            <p>
              <strong>{ticket.author?.name}</strong>
              <br />
              <span className="muted small">{ticket.author?.email}</span>
            </p>
            {book ? (
              <dl className="facts compact">
                <dt>Book</dt>
                <dd>
                  {book.title} <span className="muted">({book.id})</span>
                </dd>
                <dt>Status</dt>
                <dd>{book.status}</dd>
                <dt>ISBN</dt>
                <dd className="mono">{book.isbn}</dd>
                <dt>Sold</dt>
                <dd>{book.copiesSold}</dd>
                <dt>Earned / paid</dt>
                <dd>
                  {inr(book.royaltyEarned)} / {inr(book.royaltyPaid)}
                </dd>
                <dt>Pending</dt>
                <dd className="strong">{inr(book.royaltyPending)}</dd>
                <dt>Last payout</dt>
                <dd>{book.lastPayoutDate ? date(book.lastPayoutDate) : 'Never'}</dd>
                <dt>Platforms</dt>
                <dd>{book.availableOn.join(', ') || '—'}</dd>
              </dl>
            ) : (
              <p className="muted small">General / account-level query.</p>
            )}
            {book && <p className="muted small">{book.royaltyNote}</p>}
          </div>

          <div className="card">
            <h3>Internal notes</h3>
            <p className="muted small">Only visible to the support team.</p>
            {(ticket.notes ?? []).map((n) => (
              <div key={n.id} className="note-item">
                <div className="meta">
                  {n.adminName} · {dateTime(n.createdAt)}
                </div>
                <p>{n.body}</p>
              </div>
            ))}
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" />
            <button className="secondary small" disabled={busy || !note.trim()} onClick={addNote}>
              Add note
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
