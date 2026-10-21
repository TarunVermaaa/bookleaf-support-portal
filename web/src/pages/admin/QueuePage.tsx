import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, qs } from '../../api/client';
import type { AdminStats, Category, Priority, Status, TicketList } from '../../api/types';
import { EmptyState, ErrorBanner, LiveDot, PriorityBadge, SourceTag, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { age, CATEGORY_LABELS, hoursSince, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/format';

interface Filters {
  status: string;
  category: string;
  priority: string;
  assignee: string;
  from: string;
  to: string;
  search: string;
}

// Default view = the work that needs doing: active tickets, most urgent and oldest first.
const DEFAULT_FILTERS: Filters = { status: 'open,in_progress', category: '', priority: '', assignee: '', from: '', to: '', search: '' };

export function QueuePage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = useState<TicketList | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const query = qs({
      ...filters,
      from: filters.from ? new Date(filters.from).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
      sort: 'urgency',
      limit: 100,
    });
    api
      .get<TicketList>(`/tickets${query}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load tickets'));
    api.get<AdminStats>('/admin/stats').then(setStats).catch(() => undefined);
  }, [filters]);

  useEffect(load, [load]);
  const connected = useLiveUpdates(() => load());

  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const active = (stats?.tickets.byStatus.open ?? 0) + (stats?.tickets.byStatus.in_progress ?? 0);

  return (
    <section>
      <div className="page-head">
        <h1>
          Ticket queue <LiveDot connected={connected} />
        </h1>
      </div>

      {stats && (
        <div className="stats">
          <div className="stat">
            <span>Active tickets</span>
            <strong>{active}</strong>
          </div>
          <div className={`stat ${stats.tickets.activeByPriority.critical ? 'danger' : ''}`}>
            <span>Critical / High</span>
            <strong>
              {stats.tickets.activeByPriority.critical ?? 0} / {stats.tickets.activeByPriority.high ?? 0}
            </strong>
          </div>
          <div className="stat">
            <span>Unassigned</span>
            <strong>{stats.tickets.unassignedActive}</strong>
          </div>
          <div className="stat">
            <span>Avg first response</span>
            <strong>{stats.tickets.avgFirstResponseMinutes === null ? '—' : `${Math.round(stats.tickets.avgFirstResponseMinutes / 60)}h`}</strong>
          </div>
          <AiStat stats={stats} />
        </div>
      )}

      <div className="filters card">
        <input placeholder="Search subject, author or #number" value={filters.search} onChange={set('search')} />
        <select value={filters.status} onChange={set('status')}>
          <option value="open,in_progress">Active (open + in progress)</option>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={filters.priority} onChange={set('priority')}>
          <option value="">All priorities</option>
          {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select value={filters.category} onChange={set('category')}>
          <option value="">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={filters.assignee} onChange={set('assignee')}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <label className="inline">
          From <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="inline">
          To <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        <button className="link small" onClick={() => setFilters(DEFAULT_FILTERS)}>
          Reset
        </button>
      </div>

      <ErrorBanner message={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing here">No tickets match these filters.</EmptyState>
      ) : (
        <table className="queue">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Ticket</th>
              <th>Category</th>
              <th>Author</th>
              <th>Status</th>
              <th>Assignee</th>
              <th title="Time since the ticket was opened">Waiting</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((t) => {
              const waiting = t.status === 'open' || t.status === 'in_progress';
              // Flag tickets nobody has answered for over a day — the "oldest unresolved" signal.
              const stale = waiting && !t.firstResponseAt && hoursSince(t.createdAt) > 24;
              return (
                <tr key={t.id} className={`${t.priority === 'critical' && waiting ? 'row-critical' : ''} ${stale ? 'row-stale' : ''}`}>
                  <td>
                    <PriorityBadge priority={t.priority} />
                    {t.prioritySource === 'rules' && <SourceTag source="rules" />}
                  </td>
                  <td>
                    <Link to={`/admin/tickets/${t.id}`} className="strong">
                      #{t.number} {t.subject}
                    </Link>
                    <div className="muted small">{t.book?.title ?? 'General / Account'}</div>
                  </td>
                  <td>{t.category ? CATEGORY_LABELS[t.category] : <span className="muted">Triaging…</span>}</td>
                  <td>{t.author?.name}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>{t.assignee?.name ?? <span className="muted">—</span>}</td>
                  <td className={stale ? 'strong danger-text' : ''}>
                    {waiting ? age(t.createdAt) : '—'}
                    {stale && <div className="small">no reply yet</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data && data.total > data.items.length && <p className="muted small">Showing {data.items.length} of {data.total}. Narrow the filters to see more.</p>}
    </section>
  );
}

function AiStat({ stats }: { stats: AdminStats }) {
  const calls = stats.ai.last7Days.reduce((s, r) => s + r.calls, 0);
  const ok = stats.ai.last7Days.reduce((s, r) => s + r.ok, 0);
  const cost = stats.ai.last7Days.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);
  const status = !stats.ai.configured ? 'Off — rules only' : stats.ai.circuitBreaker.open ? 'Paused (errors)' : 'On';
  return (
    <div className={`stat ${!stats.ai.configured || stats.ai.circuitBreaker.open ? 'warn' : ''}`} title={`Model: ${stats.ai.model}`}>
      <span>AI assistant (7d)</span>
      <strong>{status}</strong>
      <span className="small">
        {stats.ai.configured
          ? `${calls} calls · ${calls ? Math.round((ok / calls) * 100) : 0}% ok · ~$${cost.toFixed(3)}`
          : 'Tickets triaged by keyword rules'}
      </span>
    </div>
  );
}
