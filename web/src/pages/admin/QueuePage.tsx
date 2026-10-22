import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, qs } from '../../api/client';
import type { AdminStats, Category, Priority, Status, TicketList } from '../../api/types';
import { EmptyState, ErrorBanner, LiveDot, PriorityBadge, SourceTag, Spinner, StatusBadge } from '../../components/ui';
import { useLiveUpdates } from '../../hooks/useLiveUpdates';
import { age, CATEGORY_LABELS, hoursSince, PRIORITY_LABELS, STATUS_LABELS } from '../../lib/format';
import {
  Layers,
  AlertCircle,
  Clock,
  User,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  BookOpen
} from '../../components/icons';

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
        <div>
          <h1>
            Support Desk Queue <LiveDot connected={connected} />
          </h1>
          <p className="page-subtitle">
            Prioritized author triage, SLA tracking, and grounded AI assistant copilot.
          </p>
        </div>
      </div>

      {stats && (
        <div className="stats">
          <div className="stat">
            <div className="stat-header">
              <span>Active Queue</span>
              <div className="stat-icon">
                <Layers size={16} />
              </div>
            </div>
            <strong>{active}</strong>
            <span className="hint" style={{ marginTop: '0.35rem' }}>
              {stats.tickets.byStatus.open ?? 0} open · {stats.tickets.byStatus.in_progress ?? 0} in progress
            </span>
          </div>

          <div className={`stat ${stats.tickets.activeByPriority.critical ? 'danger' : ''}`}>
            <div className="stat-header">
              <span>Critical / High SLA</span>
              <div className="stat-icon">
                <AlertCircle size={16} />
              </div>
            </div>
            <strong>
              {stats.tickets.activeByPriority.critical ?? 0}
              <span style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--slate-400)', margin: '0 0.35rem' }}>/</span>
              {stats.tickets.activeByPriority.high ?? 0}
            </strong>
            <span className="hint" style={{ marginTop: '0.35rem' }}>Immediate attention required</span>
          </div>

          <div className="stat">
            <div className="stat-header">
              <span>Unassigned</span>
              <div className="stat-icon">
                <User size={16} />
              </div>
            </div>
            <strong>{stats.tickets.unassignedActive}</strong>
            <span className="hint" style={{ marginTop: '0.35rem' }}>Awaiting agent assignment</span>
          </div>

          <div className="stat">
            <div className="stat-header">
              <span>Avg First Response</span>
              <div className="stat-icon">
                <Clock size={16} />
              </div>
            </div>
            <strong>{stats.tickets.avgFirstResponseMinutes === null ? '—' : `${Math.round(stats.tickets.avgFirstResponseMinutes / 60)}h`}</strong>
            <span className="hint" style={{ marginTop: '0.35rem' }}>SLA Target: &lt; 24h</span>
          </div>

          <AiStat stats={stats} />
        </div>
      )}

      {/* Filter Control Bar */}
      <div className="filters card">
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--slate-400)' }} />
          <input
            placeholder="Search by subject, author, ISBN or #number"
            value={filters.search}
            onChange={set('search')}
            style={{ paddingLeft: '2.1rem' }}
          />
        </div>

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
          <span style={{ fontSize: '0.8rem' }}>From</span>
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="inline">
          <span style={{ fontSize: '0.8rem' }}>To</span>
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>

        <button className="secondary small" onClick={() => setFilters(DEFAULT_FILTERS)} title="Reset all filters">
          <RefreshCw size={13} />
          <span>Reset</span>
        </button>
      </div>

      <ErrorBanner message={error} />

      {!data ? (
        <Spinner label="Loading ticket queue…" />
      ) : data.items.length === 0 ? (
        <EmptyState title="No tickets found matching your filters" icon={<Filter size={24} />}>
          Try clearing your search query or selecting a different status filter.
        </EmptyState>
      ) : (
        <div className="table-responsive">
          <table className="queue">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Priority</th>
                <th>Ticket & Subject</th>
                <th>Category</th>
                <th>Author</th>
                <th>Status</th>
                <th>Assignee</th>
                <th title="Time since the ticket was opened" style={{ width: '120px' }}>
                  Wait Time
                </th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => {
                const waiting = t.status === 'open' || t.status === 'in_progress';
                const stale = waiting && !t.firstResponseAt && hoursSince(t.createdAt) > 24;
                return (
                  <tr key={t.id} className={`${t.priority === 'critical' && waiting ? 'row-critical' : ''} ${stale ? 'row-stale' : ''}`}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                        <PriorityBadge priority={t.priority} />
                        {t.prioritySource === 'rules' && <SourceTag source="rules" />}
                      </div>
                    </td>
                    <td>
                      <Link to={`/admin/tickets/${t.id}`} className="strong" style={{ display: 'inline-block', fontSize: '0.92rem' }}>
                        <span className="ticket-number-tag" style={{ marginRight: '0.4rem', fontSize: '0.78rem' }}>
                          #{t.number}
                        </span>
                        {t.subject}
                      </Link>
                      <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                        <BookOpen size={11} />
                        <span>{t.book?.title ?? 'General / Account'}</span>
                      </div>
                    </td>
                    <td>
                      {t.category ? (
                        <span className="badge muted" style={{ fontSize: '0.76rem' }}>
                          {CATEGORY_LABELS[t.category]}
                        </span>
                      ) : (
                        <span className="muted small">Triaging…</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: 'var(--slate-200)',
                            color: 'var(--slate-700)',
                            fontSize: '0.7rem',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 700,
                          }}
                        >
                          {(t.author?.name || 'A')[0]}
                        </div>
                        <span style={{ fontWeight: 600 }}>{t.author?.name}</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      {t.assignee?.name ? (
                        <span className="badge muted" style={{ fontSize: '0.75rem' }}>
                          <User size={10} style={{ marginRight: 2 }} />
                          {t.assignee.name}
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '0.72rem' }}>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className={stale ? 'strong danger-text' : ''}>
                      {waiting ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={12} />
                            <span>{age(t.createdAt)}</span>
                          </div>
                          {stale && <div className="small" style={{ color: 'var(--danger-main)', fontWeight: 700, marginTop: 2 }}>⚠️ No reply yet</div>}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <Link to={`/admin/tickets/${t.id}`} className="button secondary small" style={{ padding: '0.3rem 0.5rem' }}>
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.items.length && (
        <p className="muted small" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          Showing {data.items.length} of {data.total} total tickets. Narrow down the filters above to refine your search.
        </p>
      )}
    </section>
  );
}

function AiStat({ stats }: { stats: AdminStats }) {
  const calls = stats.ai.last7Days.reduce((s, r) => s + r.calls, 0);
  const ok = stats.ai.last7Days.reduce((s, r) => s + r.ok, 0);
  const cost = stats.ai.last7Days.reduce((s, r) => s + (r.estimatedCostUsd ?? 0), 0);
  const status = !stats.ai.configured ? 'Off (Rules only)' : stats.ai.circuitBreaker.open ? 'Paused (Circuit Breaker)' : 'Active';

  return (
    <div className={`stat ${!stats.ai.configured || stats.ai.circuitBreaker.open ? 'warn' : ''}`} style={{ borderColor: 'rgba(124, 58, 237, 0.25)' }}>
      <div className="stat-header">
        <span style={{ color: '#7c3aed' }}>AI Copilot (7d)</span>
        <div className="stat-icon" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
          <Sparkles size={16} />
        </div>
      </div>
      <strong style={{ color: '#6d28d9' }}>{status}</strong>
      <span className="hint" style={{ marginTop: '0.35rem' }}>
        {stats.ai.configured
          ? `${calls} calls · ${calls ? Math.round((ok / calls) * 100) : 0}% success · ~$${cost.toFixed(3)}`
          : 'Grounded keyword rules fallback'}
      </span>
    </div>
  );
}
