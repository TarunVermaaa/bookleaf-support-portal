import type { TicketCategory } from '../db/schema.js';

/**
 * BookLeaf Knowledge Base, split into sections.
 *
 * Cost awareness: instead of sending the whole KB on every call, a draft only includes
 *   - the always-needed parts (company overview + communication tone), and
 *   - the section(s) that matter for the ticket's category, plus that category's calibration examples.
 * That keeps a draft prompt to roughly a third of the full KB.
 */
export type KbSectionId =
  | 'company'
  | 'tone'
  | 'royalty'
  | 'isbn'
  | 'printing'
  | 'distribution'
  | 'production';

export const KB_SECTIONS: Record<KbSectionId, { title: string; body: string }> = {
  company: {
    title: 'Company overview',
    body: `- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).
- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
- In-house printing facility and warehouse in Delhi; print partners include Repro India and Epitome Books.`,
  },
  tone: {
    title: 'Communication tone',
    body: `- Always empathetic and professional. Authors are partners, not customers to be managed.
- Acknowledge the author's concern before moving to solutions.
- Be specific: use actual numbers, dates and statuses instead of vague reassurance.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If the issue needs escalation or investigation, give a clear timeline (e.g. "within 48 hours"), never an open-ended promise.
- Always end with a clear next step for the author and/or the BookLeaf team.`,
  },
  royalty: {
    title: 'Royalty policy',
    body: `- 80/20 split: 80% of the net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: ₹1,000. Accumulated royalties below this roll over to the next quarter.
- Payouts are made by bank transfer to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown per platform in their dashboard.`,
  },
  isbn: {
    title: 'ISBN policy',
    body: `- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.
- Authors who want an ISBN under their own imprint must obtain it independently.
- Reported ISBN errors (duplicate, wrong book linked, mismatch across platforms) are high priority and escalated to the production team.`,
  },
  printing: {
    title: 'Printing & quality',
    body: `- In-house printing handles most orders; overflow or specific formats go to Repro India or Epitome Books.
- Standard print turnaround: 5–7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a free reprint after verification; the author may need to share photos of the defective copy.`,
  },
  distribution: {
    title: 'Distribution & availability',
    body: `- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings typically go live within 7–10 business days after publication is complete.
- A book showing as unavailable usually means a stock sync issue; BookLeaf can trigger a re-sync, live again within 24–48 hours.
- Metadata updates (e.g. description) can be submitted via the dashboard or by email and reflect on platforms within 3–5 business days.`,
  },
  production: {
    title: 'Production stages',
    body: `- Stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.
- Authors are updated by email at each stage.
- Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds). Frame such delays collaboratively — never blame the author.`,
  },
};

// Calibration examples from the KB, one per category: the expected tone and content of a good reply.
const EXAMPLES: Record<TicketCategory, string[]> = {
  royalty_payments: [
    'Query: "I published my book 4 months ago and still haven\'t received any royalty." → Acknowledge the frustration, explain the quarterly cycle and 45-day payout window, check that bank details are linked, give the specific next payout date; if genuinely overdue, escalate with a 48-hour resolution timeline.',
    'Query: "My royalty seems too low. I sold 200 copies but only received ₹3,000." → Explain net profit (MRP minus printing, platform commission, shipping), offer a line-by-line royalty breakdown, be transparent, not defensive.',
  ],
  isbn_metadata: [
    'Query: "My book shows a different ISBN on Amazon than on the physical copy." → Treat as high priority, acknowledge it is a serious data issue, confirm escalation to the production team, give a 48-hour resolution timeline.',
  ],
  printing_quality: [
    'Query: "My author copies have blurry images and misaligned pages." → Apologise sincerely, ask for photos of the defective copies, confirm a free reprint once verified, reprint timeline 5–7 business days.',
  ],
  distribution_availability: [
    'Query: "My book is published but shows Currently Unavailable on Amazon." → Explain it is typically a stock sync issue, confirm you are triggering a re-sync, set the expectation of 24–48 hours.',
  ],
  book_status_production: [
    'Query: "It\'s been 3 weeks and my book is still in typesetting." → Check the actual status, be honest about the reason (e.g. waiting on proof approval), give a specific updated timeline, frame it collaboratively.',
  ],
  general_inquiry: [
    'Query: "Can I update my book description on Amazon after it is live?" → Yes: submit via the dashboard or email; changes reflect within 3–5 business days.',
  ],
};

const CATEGORY_SECTIONS: Record<TicketCategory, KbSectionId[]> = {
  royalty_payments: ['royalty'],
  isbn_metadata: ['isbn'],
  printing_quality: ['printing'],
  distribution_availability: ['distribution'],
  book_status_production: ['production'],
  // A general question could touch anything — give the two most commonly relevant sections.
  general_inquiry: ['distribution', 'production'],
};

export const ALWAYS_INCLUDED: KbSectionId[] = ['company', 'tone'];

export function sectionsForCategory(category: TicketCategory): KbSectionId[] {
  return [...ALWAYS_INCLUDED, ...CATEGORY_SECTIONS[category]];
}

export function renderSections(ids: KbSectionId[]): string {
  return ids.map((id) => `## ${KB_SECTIONS[id].title}\n${KB_SECTIONS[id].body}`).join('\n\n');
}

export function examplesFor(category: TicketCategory): string {
  return EXAMPLES[category].map((e) => `- ${e}`).join('\n');
}

/** Full KB text — only used to report how much the per-category selection saves. */
export function fullKnowledgeBase(): string {
  return renderSections(Object.keys(KB_SECTIONS) as KbSectionId[]);
}
