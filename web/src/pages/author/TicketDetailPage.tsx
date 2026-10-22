import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TicketDetail } from '../../api/types';
import { ErrorBanner, LiveDot, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { dateTime } from '../../lib/format';
import {
  ArrowLeft,
  BookOpen,
  Send,
  Paperclip,
  CheckCircle2,
  Clock
} from '../../components/icons';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation() as { state?: { justCreated?: boolean } };
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<TicketDetail>(`/tickets/${id}`)
      .then(setTicket)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this ticket'));
  }, [id]);

  useEffect(load, [load]);
  const connected = useLiveUpdates((_type, ticketId) => {
    if (ticketId === id) load();
  });

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      setTicket(await api.post<TicketDetail>(`/tickets/${id}/messages`, { body: reply }));
      setReply('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your message');
    } finally {
      setBusy(false);
    }
  }

  if (error && !ticket) return <ErrorBanner message={error} />;
  if (!ticket) return <Spinner label="Loading ticket conversation…" />;

  return (
    <section className="narrow">
      <Link to="/tickets" className="button secondary small" style={{ marginBottom: '1.25rem' }}>
        <ArrowLeft size={14} />
        <span>Back to all queries</span>
      </Link>

      <div className="page-head" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h1>
            <span className="ticket-number-tag" style={{ marginRight: '0.4rem', fontSize: '1rem', verticalAlign: 'middle' }}>
              #{ticket.number}
            </span>
            <span>{ticket.subject}</span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            <span className="badge muted">
              <BookOpen size={11} style={{ marginRight: 2 }} />
              {ticket.book?.title ?? 'General / Account'}
            </span>
            <span className="muted small">
              Opened on {dateTime(ticket.createdAt)}
            </span>
            <LiveDot connected={connected} />
          </div>
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      {location.state?.justCreated && (
        <div className="banner success" style={{ marginBottom: '1.25rem' }}>
          <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Query received successfully!</strong> Our support desk has been notified. You can track updates and replies live right here.
          </div>
        </div>
      )}

      <ErrorBanner message={error} />

      {/* Conversation Thread */}
      <div className="thread">
        {/* Initial message by Author */}
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
              You
            </div>
            <strong>You (Original Query)</strong>
            <span>·</span>
            <span>{dateTime(ticket.createdAt)}</span>
          </div>
          <p>{ticket.description}</p>
          {ticket.attachmentName && (
            <div className="attachment-chip">
              <Paperclip size={13} />
              <span>{ticket.attachmentName}</span>
            </div>
          )}
        </div>

        {/* Subsequent replies */}
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
                  {isAdmin ? 'BL' : 'You'}
                </div>
                <strong>{isAdmin ? `${m.senderName} (BookLeaf Support)` : 'You'}</strong>
                <span>·</span>
                <span>{dateTime(m.createdAt)}</span>
              </div>
              <p>{m.body}</p>
            </div>
          );
        })}

        {ticket.messages.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem', background: 'var(--slate-50)', border: '1px dashed var(--slate-300)' }}>
            <Clock size={24} style={{ color: 'var(--brand-primary)', margin: '0 auto 0.5rem', animation: 'pulse-live 2s infinite' }} />
            <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--slate-800)' }}>
              Queued with BookLeaf Operations Desk
            </strong>
            <p className="muted small" style={{ maxWidth: 420, margin: '0.35rem auto 0' }}>
              A member of our editorial or royalty support team is reviewing your query. Replies will appear here automatically.
            </p>
          </div>
        )}
      </div>

      {/* Reply Box */}
      {ticket.status !== 'closed' ? (
        <form className="card reply-form-wrapper" onSubmit={send}>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.5rem', color: 'var(--slate-800)' }}>
            Add information or reply to the team
          </div>
          <div className="reply">
            <textarea
              rows={3}
              placeholder="Type your response here…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <button className="primary" disabled={busy || !reply.trim()} style={{ height: '42px', flexShrink: 0 }}>
              <Send size={15} />
              <span>{busy ? 'Sending…' : 'Send'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="banner" style={{ background: 'var(--slate-100)', borderColor: 'var(--slate-200)', color: 'var(--slate-600)' }}>
          This ticket has been marked as closed. If you require further assistance regarding this topic, please raise a new query.
        </div>
      )}
    </section>
  );
}
