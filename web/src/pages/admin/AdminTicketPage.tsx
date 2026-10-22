import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { AiDraft, Book, BooksResponse, Category, Priority, Status, TicketDetail, User } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBanner, LiveDot, SourceTag, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { age, CATEGORY_LABELS, date, dateTime, inr, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/format';
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  Send,
  Paperclip,
  CheckCircle2,
  User as UserIcon,
  Shield,
  Layers,
  RefreshCw,
  FileText
} from '../../components/icons';

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
        setDraft({ available: false, reason: e instanceof ApiError ? e.message : 'Could not generate an AI draft' });
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
      setError(e instanceof ApiError ? e.message : 'Could not add the internal note');
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
  if (!ticket) return <Spinner label="Loading ticket and author profile…" />;

  return (
    <section>
      <Link to="/admin" className="button secondary small" style={{ marginBottom: '1.25rem' }}>
        <ArrowLeft size={14} />
        <span>Back to ticket queue</span>
      </Link>

      <div className="page-head">
        <div>
          <h1>
            <span className="ticket-number-tag" style={{ marginRight: '0.4rem', fontSize: '1rem', verticalAlign: 'middle' }}>
              #{ticket.number}
            </span>
            <span>{ticket.subject}</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
            <span className="badge muted">
              <BookOpen size={11} style={{ marginRight: 2 }} />
              {ticket.book?.title ?? 'General / Account'}
            </span>
            <span className="muted small">
              Opened {dateTime(ticket.createdAt)} ({age(ticket.createdAt)} ago)
            </span>
            <LiveDot connected={connected} />
          </div>
        </div>
        <div className="row-right">
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="two-col">
        {/* ---- Conversation + reply ---- */}
        <div>
          <div className="thread">
            {/* Initial author inquiry */}
            <div className="message author">
              <div className="meta">
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: 'var(--slate-200)',
                  color: 'var(--slate-700)',
                  fontSize: '0.7rem',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700
                }}>
                  {(ticket.author?.name || 'A')[0]}
                </div>
                <strong>{ticket.author?.name} (Author Inquiry)</strong>
                <span>·</span>
                <span>{dateTime(ticket.createdAt)} ({age(ticket.createdAt)} ago)</span>
              </div>
              <p>{ticket.description}</p>
              {ticket.attachmentName && (
                <div className="attachment-chip">
                  <Paperclip size={13} />
                  <span>{ticket.attachmentName}</span>
                </div>
              )}
            </div>

            {/* Conversation messages */}
            {ticket.messages.map((m) => {
              const isAdmin = m.senderRole === 'admin';
              return (
                <div key={m.id} className={`message ${m.senderRole}`}>
                  <div className="meta">
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: isAdmin ? '#ccfbf1' : 'var(--slate-200)',
                      color: isAdmin ? '#0f766e' : 'var(--slate-700)',
                      fontSize: '0.7rem',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700
                    }}>
                      {isAdmin ? 'BL' : 'AU'}
                    </div>
                    <strong>{m.senderName}</strong>
                    <span>·</span>
                    <span>{dateTime(m.createdAt)}</span>
                    {m.aiAssisted && (
                      <span className="source source-ai" style={{ marginLeft: 6 }}>
                        <Sparkles size={11} />
                        AI-assisted
                      </span>
                    )}
                  </div>
                  <p>{m.body}</p>
                </div>
              );
            })}
          </div>

          {/* AI-assisted reply composer */}
          {ticket.status !== 'closed' && (
            <div className="card composer" style={{ marginTop: '1.5rem' }}>
              <div className="composer-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div className="ai-copilot-pill">
                    <Sparkles size={13} />
                    <span>BookLeaf AI Drafting Copilot</span>
                  </div>
                  {draft?.available && (
                    <span className="muted small" style={{ fontSize: '0.76rem' }}>
                      Grounding: {draft.kbSections.join(', ')}
                    </span>
                  )}
                </div>

                <div className="row-right">
                  <button
                    type="button"
                    className="secondary small"
                    disabled={draftLoading}
                    onClick={() => loadDraft(true)}
                  >
                    <RefreshCw size={13} className={draftLoading ? 'spin' : ''} />
                    <span>{draftLoading ? 'Generating…' : draft?.available ? 'Regenerate draft' : 'Generate AI draft'}</span>
                  </button>
                </div>
              </div>

              {draftLoading && !reply && (
                <Spinner label="Consulting BookLeaf publishing knowledge base and royalty records…" />
              )}

              {draft && !draft.available && (
                <div className="banner warn" style={{ margin: '0.4rem 0', fontSize: '0.82rem' }}>
                  {draft.reason}
                </div>
              )}

              <textarea
                rows={9}
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                  if (replyFromDraft) setReplyFromDraft(true);
                }}
                placeholder="Compose a response to the author. The reply will be immediately delivered to their portal…"
              />

              <div className="actions" style={{ marginTop: '0.75rem' }}>
                <span className="muted small" style={{ marginRight: 'auto' }}>
                  {replyFromDraft ? '✨ Prefilled from AI knowledge base. Edit as needed before dispatching.' : ''}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !reply.trim()}
                  onClick={() => sendReply(false)}
                >
                  <Send size={14} />
                  <span>Send reply</span>
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !reply.trim()}
                  onClick={() => sendReply(true)}
                >
                  <CheckCircle2 size={14} />
                  <span>Send & resolve ticket</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---- Side panel: triage, management, context ---- */}
        <aside className="side">
          {/* Triage controls */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Layers size={16} />
                <span>AI Triage & Priority</span>
              </h3>
              <button className="link small" disabled={busy} onClick={retriage} style={{ fontSize: '0.78rem' }}>
                <RefreshCw size={12} style={{ marginRight: 2 }} />
                Re-triage
              </button>
            </div>

            <label>
              <div className="label-row">
                <span>Category</span>
                <SourceTag source={ticket.categorySource} />
              </div>
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
              <div className="label-row">
                <span>Priority Level</span>
                <SourceTag source={ticket.prioritySource} />
              </div>
              <select
                value={ticket.priority ?? ''}
                disabled={busy}
                onChange={(e) => patch({ priority: e.target.value as Priority })}
              >
                {!ticket.priority && <option value="">Triaging…</option>}
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>

            {ticket.aiReasoning && (
              <div
                style={{
                  background: 'var(--slate-50)',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.65rem 0.8rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  color: 'var(--slate-700)',
                  marginTop: '0.5rem',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--slate-900)', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={12} color="#7c3aed" />
                  <span>AI Reasoning</span>
                </div>
                {ticket.aiReasoning}
              </div>
            )}
          </div>

          {/* Ticket Management */}
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Shield size={16} />
              <span>Assignment & Status</span>
            </h3>

            <label>
              <span>Ticket Status</span>
              <select
                value={ticket.status}
                disabled={busy}
                onChange={(e) => patch({ status: e.target.value as Status })}
              >
                {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Assigned Agent</span>
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
              <button
                type="button"
                className="secondary small"
                disabled={busy}
                onClick={() => patch({ assigneeId: user!.id })}
                style={{ width: '100%', marginTop: '0.25rem' }}
              >
                <UserIcon size={13} />
                <span>Assign ticket to me</span>
              </button>
            )}
          </div>

          {/* Author & Book Facts */}
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <BookOpen size={16} />
              <span>Author & Book Context</span>
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  color: '#334155',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {(ticket.author?.name || 'A')[0]}
              </div>
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block' }}>{ticket.author?.name}</strong>
                <span className="muted small">{ticket.author?.email}</span>
              </div>
            </div>

            {book ? (
              <>
                <dl className="facts compact">
                  <dt>Title</dt>
                  <dd>{book.title}</dd>
                  <dt>Status</dt>
                  <dd>
                    <span className={`badge ${book.inProduction ? 'status-in_progress' : 'status-resolved'}`} style={{ fontSize: '0.72rem' }}>
                      {book.status}
                    </span>
                  </dd>
                  <dt>ISBN</dt>
                  <dd className="mono">{book.isbn}</dd>
                  <dt>Copies Sold</dt>
                  <dd>{book.copiesSold.toLocaleString('en-IN')}</dd>
                  <dt>Earned / Paid</dt>
                  <dd>
                    {inr(book.royaltyEarned)} / {inr(book.royaltyPaid)}
                  </dd>
                  <dt>Pending</dt>
                  <dd style={{ color: book.royaltyPending > 0 ? '#047857' : 'inherit', fontWeight: 700 }}>
                    {inr(book.royaltyPending)}
                  </dd>
                  <dt>Last Payout</dt>
                  <dd>{book.lastPayoutDate ? date(book.lastPayoutDate) : 'Never'}</dd>
                  <dt>Platforms</dt>
                  <dd>{book.availableOn.join(', ') || '—'}</dd>
                </dl>
                <div className={`note state-${book.royaltyState}`} style={{ marginTop: '0.65rem', marginBottom: 0 }}>
                  {book.royaltyNote}
                </div>
              </>
            ) : (
              <p className="muted small">This is a general or account-level inquiry with no specific book tied.</p>
            )}
          </div>

          {/* Internal Notes */}
          <div className="card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileText size={16} />
              <span>Internal Operations Notes</span>
            </h3>
            <p className="hint" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Confidential notes visible only to the BookLeaf support team.
            </p>

            {(ticket.notes ?? []).map((n) => (
              <div key={n.id} className="note-item">
                <div className="meta">
                  <strong>{n.adminName}</strong> · {dateTime(n.createdAt)}
                </div>
                <p style={{ margin: 0 }}>{n.body}</p>
              </div>
            ))}

            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add internal notes for team members…"
              style={{ marginTop: '0.5rem' }}
            />
            <button
              type="button"
              className="secondary small"
              disabled={busy || !note.trim()}
              onClick={addNote}
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              Save internal note
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
