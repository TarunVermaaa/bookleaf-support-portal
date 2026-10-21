import type { Category, Priority, Status, TriageSource } from '../api/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  royalty_payments: 'Royalty & Payments',
  isbn_metadata: 'ISBN & Metadata',
  printing_quality: 'Printing & Quality',
  distribution_availability: 'Distribution & Availability',
  book_status_production: 'Book Status & Production',
  general_inquiry: 'General Inquiry',
};

export const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const SOURCE_LABELS: Record<TriageSource, string> = {
  ai: 'AI',
  rules: 'Rules (AI offline)',
  admin: 'Set by admin',
};

export const inr = (n: number | null) => (n === null ? '—' : `₹${n.toLocaleString('en-IN')}`);

export const date = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const dateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "3h", "2d" — how long something has been waiting. */
export function age(from: string, to: Date = new Date()) {
  const mins = Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export const hoursSince = (from: string) => (Date.now() - new Date(from).getTime()) / 3_600_000;
