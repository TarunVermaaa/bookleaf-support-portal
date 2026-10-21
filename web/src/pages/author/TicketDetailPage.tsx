import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TicketDetail } from '../../api/types';
import { ErrorBanner, LiveDot, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { dateTime } from '../../lib/format';

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
  if (!ticket) return <Spinner />;

  return (
    <section className="narrow">
      <Link to="/tickets" className="link small">
        ← My Tickets
      </Link>
      <div className="page-head">
        <h1>
          <span className="muted">#{ticket.number}</span> {ticket.subject}
        </h1>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="muted small">
        {ticket.book?.title ?? 'General / Account'} · opened {dateTime(ticket.createdAt)} <LiveDot connected={connected} />
      </p>
      {location.state?.justCreated && (
        <div className="banner success">Thanks — your query has been received. You'll see our reply here as soon as the team responds.</div>
      )}
      <ErrorBanner message={error} />

      <div className="thread">
        <div className="message author">
          <div className="meta">You · {dateTime(ticket.createdAt)}</div>
          <p>{ticket.description}</p>
          {ticket.attachmentName && <div className="muted small">📎 {ticket.attachmentName}</div>}
        </div>
        {ticket.messages.map((m) => (
          <div key={m.id} className={`message ${m.senderRole}`}>
            <div className="meta">
              {m.senderRole === 'admin' ? m.senderName : 'You'} · {dateTime(m.createdAt)}
            </div>
            <p>{m.body}</p>
          </div>
        ))}
        {ticket.messages.length === 0 && <p className="muted small waiting">Waiting for a response from the BookLeaf team…</p>}
      </div>

      {ticket.status !== 'closed' ? (
        <form className="reply" onSubmit={send}>
          <textarea rows={3} placeholder="Add more details or reply to the team…" value={reply} onChange={(e) => setReply(e.target.value)} />
          <button className="primary" disabled={busy || !reply.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </form>
      ) : (
        <p className="muted small">This ticket is closed. Raise a new query if you need more help.</p>
      )}
    </section>
  );
}
