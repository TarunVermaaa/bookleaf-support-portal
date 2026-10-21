import type { TicketCategory, TicketPriority } from '../db/schema.js';

// Single source of truth for categories and priorities: used in prompts, rule-based fallback,
// API validation and labels. Keys are stable identifiers; labels are what humans see.
export const CATEGORIES: Record<TicketCategory, { label: string; description: string }> = {
  royalty_payments: {
    label: 'Royalty & Payments',
    description: 'Royalty amounts, missing or late payouts, payout schedule, bank details, royalty breakdowns.',
  },
  isbn_metadata: {
    label: 'ISBN & Metadata Issues',
    description: 'Wrong/duplicate ISBN, ISBN mismatch across platforms, title/author/description/price metadata errors.',
  },
  printing_quality: {
    label: 'Printing & Quality',
    description: 'Misprints, blurry images, binding defects, colour issues, damaged author copies, print turnaround.',
  },
  distribution_availability: {
    label: 'Distribution & Availability',
    description: 'Book missing or "currently unavailable" on Amazon/Flipkart/BookLeaf Store, listing go-live time.',
  },
  book_status_production: {
    label: 'Book Status & Production Updates',
    description: 'Where a book is in production (editing, cover, typesetting, proofreading…), delays, timelines.',
  },
  general_inquiry: {
    label: 'General Inquiry',
    description: 'Account, packages, how-to questions, profile/bio changes and anything that fits no other category.',
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as TicketCategory[];
export const PRIORITY_KEYS: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

// Used by both the AI prompt and the rules fallback, so humans and the model judge urgency the same way.
export const PRIORITY_RUBRIC = `- critical: money owed to the author is long overdue (e.g. no royalty for 6+ months / multiple missed payouts), a wrong book or wrong author attached to a live listing, legal or rights issues, or an angry author threatening to leave.
- high: ISBN errors or mismatches (BookLeaf policy: always high priority), defective printed copies, a published book unavailable on a sales platform, a royalty payment that looks overdue, production stalled well beyond normal timelines.
- medium: questions about a royalty amount or calculation, production status updates within normal timelines, listing go-live timing, metadata change requests.
- low: general questions, how-to questions, profile or author-bio edits, feature requests.`;

// Sorting weight for the admin queue: lower = more urgent.
export const PRIORITY_RANK: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
