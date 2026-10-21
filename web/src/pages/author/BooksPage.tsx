import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Book, BooksResponse } from '../../api/types';
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui';
import { date, inr } from '../../lib/format';

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
  if (!data) return <Spinner />;

  const { items, totals, payoutCalendar: cal } = data;

  return (
    <section>
      <div className="page-head">
        <h1>My Books</h1>
        <Link className="button" to="/tickets/new">
          Ask a question
        </Link>
      </div>

      <div className="stats">
        <Stat label="Copies sold" value={totals.copiesSold.toLocaleString('en-IN')} />
        <Stat label="Royalty earned" value={inr(totals.royaltyEarned)} />
        <Stat label="Royalty paid" value={inr(totals.royaltyPaid)} />
        <Stat label="Royalty pending" value={inr(totals.royaltyPending)} highlight={totals.royaltyPending > 0} />
      </div>

      <div className="banner info">
        Royalties are calculated every quarter and paid within 45 days. Royalties for <strong>{cal.lastQuarterLabel}</strong> are due by{' '}
        <strong>{date(cal.payoutDueBy)}</strong>. Pending amounts below ₹1,000 roll over to the next quarter.
      </div>

      {items.length === 0 ? (
        <EmptyState title="No books yet">Once your manuscript is received, your book will appear here with its production status.</EmptyState>
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

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`stat ${highlight ? 'highlight' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BookCard({ book: b }: { book: Book }) {
  return (
    <article className="card book">
      <header>
        <div>
          <h2>{b.title}</h2>
          <span className="muted small">
            {b.genre} · {b.id}
          </span>
        </div>
        <span className={`badge ${b.inProduction ? 'status-in_progress' : 'status-resolved'}`}>{b.status}</span>
      </header>

      <dl className="facts">
        <dt>ISBN</dt>
        <dd className="mono">{b.isbn}</dd>
        <dt>Published</dt>
        <dd>{b.inProduction ? 'In production' : date(b.publicationDate)}</dd>
        <dt>MRP</dt>
        <dd>{b.mrp === null ? 'Set before publication' : inr(b.mrp)}</dd>
        <dt>Copies sold</dt>
        <dd>{b.copiesSold.toLocaleString('en-IN')}</dd>
        <dt>Royalty earned</dt>
        <dd>{inr(b.royaltyEarned)}</dd>
        <dt>Royalty paid</dt>
        <dd>{inr(b.royaltyPaid)}</dd>
        <dt>Royalty pending</dt>
        <dd className={b.royaltyPending > 0 ? 'strong' : ''}>{inr(b.royaltyPending)}</dd>
        <dt>Last payout</dt>
        <dd>{b.lastPayoutDate ? date(b.lastPayoutDate) : 'No payout yet'}</dd>
        <dt>Available on</dt>
        <dd>{b.availableOn.length ? b.availableOn.join(', ') : 'Not listed yet'}</dd>
      </dl>

      <p className={`note state-${b.royaltyState}`}>{b.royaltyNote}</p>
      <Link className="link small" to={`/tickets/new?book=${b.id}`}>
        Raise a query about this book →
      </Link>
    </article>
  );
}
