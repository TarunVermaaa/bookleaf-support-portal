import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { TicketList } from '../../api/types';
import { EmptyState, ErrorBanner, LiveDot, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { dateTime } from '../../lib/format';
import { Plus, Ticket, Search, MessageSquare, ChevronRight, BookOpen, Clock } from '../../components/icons';

export function TicketsPage() {
  const [data, setData] = useState<TicketList | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<TicketList>('/tickets')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load tickets'));
  }, []);

  useEffect(load, [load]);
  const connected = useLiveUpdates(() => load());

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Spinner label="Loading your support inquiries…" />;

  const filteredItems = data.items.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.subject.toLowerCase().includes(q) ||
      t.number.toString().includes(q) ||
      (t.book?.title ?? '').toLowerCase().includes(q)
    );
  });

  const openCount = data.items.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  const resolvedCount = data.items.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>
            My Support Queries <LiveDot connected={connected} />
          </h1>
          <p className="page-subtitle">
            Track communication with BookLeaf's editorial, distribution, and royalty teams.
          </p>
        </div>
        <Link className="button primary" to="/tickets/new">
          <Plus size={16} />
          <span>New query</span>
        </Link>
      </div>

      {/* Overview Metric Bar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.4rem', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <span className="muted small" style={{ display: 'block', fontWeight: 600 }}>Total Queries</span>
            <strong style={{ fontSize: '1.25rem' }}>{data.items.length}</strong>
          </div>
          <div style={{ height: 28, width: 1, background: 'var(--slate-200)' }} />
          <div>
            <span className="muted small" style={{ display: 'block', fontWeight: 600 }}>Active / Pending</span>
            <strong style={{ fontSize: '1.25rem', color: openCount > 0 ? '#b45309' : 'inherit' }}>
              {openCount}
            </strong>
          </div>
          <div style={{ height: 28, width: 1, background: 'var(--slate-200)' }} />
          <div>
            <span className="muted small" style={{ display: 'block', fontWeight: 600 }}>Resolved</span>
            <strong style={{ fontSize: '1.25rem', color: '#047857' }}>
              {resolvedCount}
            </strong>
          </div>
        </div>

        {data.items.length > 3 && (
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--slate-400)' }} />
            <input
              type="text"
              placeholder="Search inquiries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.1rem', paddingRight: '0.75rem', fontSize: '0.85rem' }}
            />
          </div>
        )}
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="No support queries raised yet"
          icon={<Ticket size={24} />}
        >
          Have questions regarding royalty calculation, ISBN allocation, cover adjustments, or author copies?
          Raise a query and our team will assist you within 24 hours.
        </EmptyState>
      ) : filteredItems.length === 0 ? (
        <EmptyState title="No matching queries found">
          Try adjusting your search terms or view all queries.
        </EmptyState>
      ) : (
        <ul className="ticket-list">
          {filteredItems.map((t) => (
            <li key={t.id}>
              <Link to={`/tickets/${t.id}`} className="ticket-row interactive">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ticket-row-title">
                    <span className="ticket-number-tag">#{t.number}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    <span className="badge muted" style={{ fontSize: '0.74rem' }}>
                      <BookOpen size={11} style={{ marginRight: 2 }} />
                      {t.book?.title ?? 'General / Account'}
                    </span>
                    <span className="muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} />
                      Opened {dateTime(t.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="row-right" style={{ gap: '1rem', flexShrink: 0 }}>
                  {t.messageCount > 0 && (
                    <span className="badge muted" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <MessageSquare size={12} />
                      {t.messageCount} {t.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                  )}
                  <StatusBadge status={t.status} />
                  <ChevronRight size={18} color="var(--slate-400)" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
