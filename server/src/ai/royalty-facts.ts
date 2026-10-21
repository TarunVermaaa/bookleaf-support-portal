import type { Book } from '../db/schema.js';

export const PAYOUT_THRESHOLD = 1000; // ₹, from the royalty policy
const PAYOUT_WINDOW_DAYS = 45;

export interface PayoutCalendar {
  lastQuarterLabel: string; // e.g. "Jul–Sep 2026"
  lastQuarterEnd: string; // ISO date
  payoutDueBy: string; // ISO date: quarter end + 45 days
  nextQuarterLabel: string;
  nextPayoutDueBy: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

function quarterEnd(year: number, q: number): Date {
  // Last day of the quarter's final month (UTC): day 0 of the next month.
  return new Date(Date.UTC(year, q * 3 + 3, 0));
}
function quarterLabel(year: number, q: number) {
  return `${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]} ${year}`;
}

/**
 * Royalties are calculated per calendar quarter and paid within 45 days of the quarter ending.
 * Given "today", returns the most recently completed quarter (and when its payout is due) and the next one.
 * This gives the AI an exact date to quote instead of "soon".
 */
export function payoutCalendar(today = new Date()): PayoutCalendar {
  const year = today.getUTCFullYear();
  const currentQ = Math.floor(today.getUTCMonth() / 3);
  const lastQ = currentQ === 0 ? 3 : currentQ - 1;
  const lastQYear = currentQ === 0 ? year - 1 : year;
  const lastEnd = quarterEnd(lastQYear, lastQ);
  const currentEnd = quarterEnd(year, currentQ);
  return {
    lastQuarterLabel: quarterLabel(lastQYear, lastQ),
    lastQuarterEnd: iso(lastEnd),
    payoutDueBy: iso(addDays(lastEnd, PAYOUT_WINDOW_DAYS)),
    nextQuarterLabel: quarterLabel(year, currentQ),
    nextPayoutDueBy: iso(addDays(currentEnd, PAYOUT_WINDOW_DAYS)),
  };
}

export type RoyaltyState = 'in_production' | 'below_threshold' | 'payout_due' | 'fully_paid' | 'no_sales';

/** A plain-language read of a book's royalty position — used both in the UI and as AI context. */
export function royaltyState(book: Pick<Book, 'status' | 'royaltyPending' | 'royaltyEarned' | 'copiesSold'>): RoyaltyState {
  if (!/published/i.test(book.status)) return 'in_production';
  if (book.copiesSold === 0 || book.royaltyEarned === 0) return 'no_sales';
  if (book.royaltyPending === 0) return 'fully_paid';
  if (book.royaltyPending < PAYOUT_THRESHOLD) return 'below_threshold';
  return 'payout_due';
}

export const ROYALTY_STATE_NOTE: Record<RoyaltyState, string> = {
  in_production: 'Book is still in production — no sales or royalties yet.',
  no_sales: 'No sales recorded yet, so no royalty has accrued.',
  fully_paid: 'All earned royalty has been paid out; nothing pending.',
  below_threshold: `Pending royalty is below the ₹${PAYOUT_THRESHOLD.toLocaleString('en-IN')} payout threshold, so it rolls over to the next quarter.`,
  payout_due: 'Pending royalty is above the payout threshold and will be included in the next quarterly payout.',
};
