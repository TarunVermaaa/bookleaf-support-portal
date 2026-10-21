import { describe, expect, it } from 'vitest';
import { buildDraftPrompt, type DraftContext } from '../src/ai/draft.js';
import { fullKnowledgeBase, KB_SECTIONS } from '../src/ai/knowledge-base.js';
import type { Book } from '../src/db/schema.js';

const book: Book = {
  id: 'BK005',
  authorId: 'a1',
  title: 'Between Two Temples',
  isbn: '978-93-5XXXX-05-9',
  genre: 'Historical Fiction',
  publicationDate: '2024-07-05',
  status: 'Published & Live',
  mrp: 425,
  royaltyPerCopy: 38,
  copiesSold: 67,
  royaltyEarned: 2546,
  royaltyPaid: 0,
  royaltyPending: 2546,
  lastPayoutDate: null,
  printPartner: 'Epitome Books',
  availableOn: ['Amazon India', 'BookLeaf Store'],
};

const ctx = (overrides: Partial<DraftContext> = {}): DraftContext => ({
  ticket: {
    id: 't1',
    number: 7,
    subject: 'No royalty yet',
    description: "It's been over a year and I haven't received any royalty.",
    category: 'royalty_payments',
    priority: 'high',
    createdAt: new Date('2026-10-20T10:00:00Z'),
  },
  author: { name: 'Ananya Reddy', joinedDate: '2024-02-10' },
  book,
  thread: [],
  today: new Date('2026-10-21T10:00:00Z'),
  ...overrides,
});

describe('draft prompt', () => {
  it('includes only the KB sections relevant to the category', () => {
    const p = buildDraftPrompt(ctx());
    expect(p.sections).toEqual(['company', 'tone', 'royalty']);
    expect(p.system.dynamic).toContain(KB_SECTIONS.royalty.title);
    expect(p.system.dynamic).not.toContain(KB_SECTIONS.printing.title);
    expect(p.system.dynamic).not.toContain(KB_SECTIONS.isbn.title);
  });

  it('is meaningfully smaller than sending the whole knowledge base', () => {
    const p = buildDraftPrompt(ctx());
    const sectionsOnly = p.system.dynamic!.split('# How similar tickets')[0];
    expect(sectionsOnly.length).toBeLessThan(fullKnowledgeBase().length * 0.6);
  });

  it('gives the model exact facts, including the computed payout date', () => {
    const p = buildDraftPrompt(ctx());
    expect(p.user).toContain('₹2,546');
    expect(p.user).toContain('last payout: not yet');
    expect(p.user).toContain('14 November 2026'); // Jul–Sep quarter + 45 days
    expect(p.user).toContain('978-93-5XXXX-05-9');
  });

  it('only sends the most recent messages of a long thread', () => {
    const thread = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 ? 'admin' : 'author') as 'admin' | 'author',
      body: `message ${i}`,
      createdAt: new Date('2026-10-20T10:00:00Z'),
    }));
    const p = buildDraftPrompt(ctx({ thread }));
    expect(p.user).toContain('4 older messages omitted');
    expect(p.user).not.toContain('message 3');
    expect(p.user).toContain('message 9');
  });

  it('handles a book still in production (no MRP or royalty yet)', () => {
    const inProd = { ...book, status: 'In Production - Cover Design', mrp: null, royaltyPerCopy: null, copiesSold: 0, royaltyEarned: 0, royaltyPending: 0, publicationDate: null };
    const p = buildDraftPrompt(ctx({ book: inProd, ticket: { ...ctx().ticket, category: 'book_status_production' } }));
    expect(p.user).toContain('MRP not set yet');
    expect(p.user).toContain('still in production');
    expect(p.sections).toContain('production');
  });
});
