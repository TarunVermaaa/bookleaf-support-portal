import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Book, BooksResponse } from '../../api/types';
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui';
import { date, inr } from '../../lib/format';
import {
  BookOpen,
  IndianRupee,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Plus,
  HelpCircle,
  ChevronRight,
  Clock
} from '../../components/icons';

export function BooksPage() {
  const [data, setData] = useState<BooksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BooksResponse>('/books')
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load your books'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Spinner label="Loading your published titles and royalties…" />;

  const { items, totals, payoutCalendar: cal } = data;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>My Published Titles & Royalties</h1>
          <p className="page-subtitle">
            Real-time sales tracking, production milestones, and quarterly royalty earnings.
          </p>
        </div>
        <Link className="button primary" to="/tickets/new">
          <Plus size={16} />
          <span>Raise a query</span>
        </Link>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats">
        <div className="stat">
          <div className="stat-header">
            <span>Total Copies Sold</span>
            <div className="stat-icon">
              <BookOpen size={16} />
            </div>
          </div>
          <strong>{totals.copiesSold.toLocaleString('en-IN')}</strong>
          <span className="hint" style={{ marginTop: '0.4rem' }}>Across all distribution channels</span>
        </div>

        <div className="stat">
          <div className="stat-header">
            <span>Royalty Earned</span>
            <div className="stat-icon">
              <TrendingUp size={16} />
            </div>
          </div>
          <strong>{inr(totals.royaltyEarned)}</strong>
          <span className="hint" style={{ marginTop: '0.4rem' }}>Lifetime accrued royalties</span>
        </div>

        <div className="stat">
          <div className="stat-header">
            <span>Royalty Disbursed</span>
            <div className="stat-icon">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <strong>{inr(totals.royaltyPaid)}</strong>
          <span className="hint" style={{ marginTop: '0.4rem' }}>Paid directly to your bank account</span>
        </div>

        <div className={`stat ${totals.royaltyPending > 0 ? 'highlight' : ''}`}>
          <div className="stat-header">
            <span>Royalty Pending</span>
            <div className="stat-icon">
              <IndianRupee size={16} />
            </div>
          </div>
          <strong>{inr(totals.royaltyPending)}</strong>
          <span className="hint" style={{ marginTop: '0.4rem' }}>
            {totals.royaltyPending >= 1000 ? 'Scheduled for next payout' : 'Under ₹1,000 threshold (rolls over)'}
          </span>
        </div>
      </div>

      {/* Payout Calendar Callout */}
      <div className="banner info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Calendar size={20} style={{ color: '#0f766e', flexShrink: 0 }} />
          <div>
            <strong>Quarterly Royalty Cycle: </strong>
            Royalties for <strong>{cal.lastQuarterLabel}</strong> are scheduled for disbursement by{' '}
            <span className="badge status-open" style={{ margin: '0 0.3rem' }}>{date(cal.payoutDueBy)}</span>.
            Amounts below ₹1,000 roll over automatically to the subsequent quarter.
          </div>
        </div>
        <Link to="/tickets/new" className="link small" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span>Questions about payouts?</span>
          <ChevronRight size={14} />
        </Link>
      </div>

      {/* Books Grid */}
      {items.length === 0 ? (
        <EmptyState
          title="No books linked to your account yet"
          icon={<BookOpen size={24} />}
        >
          Once your manuscript is accepted and enters production, your title will appear here with live milestones.
        </EmptyState>
      ) : (
        <div className="book-grid">
          {items.map((b) => (
            <BookCard key={b.id} book={b} />
          ))}
        </div>
      )}
    </section>
  );
}

function BookCard({ book: b }: { book: Book }) {
  return (
    <article className="book card">
      <div>
        <header>
          <div>
            <h2>{b.title}</h2>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
              <span className="badge muted">{b.genre}</span>
              <span className="mono small" style={{ color: 'var(--slate-500)' }}>
                {b.id}
              </span>
            </div>
          </div>
          <span className={`badge ${b.inProduction ? 'status-in_progress' : 'status-resolved'}`}>
            {b.inProduction ? <Clock size={12} /> : <CheckCircle2 size={12} />}
            {b.status}
          </span>
        </header>

        <dl className="facts">
          <dt>ISBN</dt>
          <dd className="mono">{b.isbn}</dd>
          <dt>Release Date</dt>
          <dd>{b.inProduction ? <span className="badge status-in_progress">In Production</span> : date(b.publicationDate)}</dd>
          <dt>Cover Price (MRP)</dt>
          <dd>{b.mrp === null ? 'Determined before launch' : inr(b.mrp)}</dd>
          <dt>Total Copies Sold</dt>
          <dd>{b.copiesSold.toLocaleString('en-IN')}</dd>
          <dt>Royalty Earned</dt>
          <dd>{inr(b.royaltyEarned)}</dd>
          <dt>Royalty Paid</dt>
          <dd>{inr(b.royaltyPaid)}</dd>
          <dt>Royalty Pending</dt>
          <dd style={{ color: b.royaltyPending > 0 ? '#047857' : 'inherit', fontWeight: 700 }}>
            {inr(b.royaltyPending)}
          </dd>
          <dt>Last Payout</dt>
          <dd>{b.lastPayoutDate ? date(b.lastPayoutDate) : 'No disbursement yet'}</dd>
          <dt>Listed Platforms</dt>
          <dd>
            {b.availableOn.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {b.availableOn.map((p) => (
                  <span key={p} className="badge muted" style={{ fontSize: '0.72rem' }}>
                    {p}
                  </span>
                ))}
              </div>
            ) : (
              <span className="muted small">Listing in progress</span>
            )}
          </dd>
        </dl>

        <p className={`note state-${b.royaltyState}`}>
          {b.royaltyNote}
        </p>
      </div>

      <div style={{ paddingTop: '0.85rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
        <Link className="button secondary small" to={`/tickets/new?book=${b.id}`}>
          <HelpCircle size={14} />
          <span>Raise a query about this book</span>
        </Link>
      </div>
    </article>
  );
}
