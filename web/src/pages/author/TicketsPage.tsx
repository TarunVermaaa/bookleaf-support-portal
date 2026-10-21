import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TicketList } from '../../api/types';
import { EmptyState, ErrorBanner, LiveDot, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { dateTime } from '../../lib/format';

export function TicketsPage() {
  const [data, setData] = useState<TicketList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<TicketList>('/tickets')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load tickets'));
  }, []);

  useEffect(load, [load]);
  // Any change to one of my tickets (e.g. a support reply) refreshes the list — no page reload needed.
  const connected = useLiveUpdates(() => load());

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Spinner />;

  return (
    <section>
      <div className="page-head">
        <h1>
          My Tickets <LiveDot connected={connected} />
        </h1>
        <Link className="button" to="/tickets/new">
          New query
        </Link>
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="No queries yet">Questions about royalties, ISBNs, printing or your book's status? Raise a query and we'll get back to you.</EmptyState>
      ) : (
        <ul className="ticket-list">
          {data.items.map((t) => (
            <li key={t.id}>
              <Link to={`/tickets/${t.id}`} className="ticket-row">
                <div>
                  <span className="muted small">#{t.number}</span> <strong>{t.subject}</strong>
                  <div className="muted small">
                    {t.book?.title ?? 'General / Account'} · opened {dateTime(t.createdAt)}
                  </div>
                </div>
                <div className="row-right">
                  {t.messageCount > 0 && <span className="muted small">{t.messageCount} message{t.messageCount > 1 ? 's' : ''}</span>}
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
