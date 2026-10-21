import { describe, expect, it } from 'vitest';
import { triageByRules } from '../src/ai/rules.js';

// The fallback must give sensible answers for the exact sample queries in the BookLeaf brief.
describe('rule-based triage (AI unavailable fallback)', () => {
  const cases: [string, string, string, string][] = [
    ['No royalty yet', 'I published my book 4 months ago and still haven\'t received any royalty. What\'s going on?', 'royalty_payments', 'high'],
    ['Royalty seems low', 'My royalty amount seems too low. I sold 200 copies but only received ₹3,000.', 'royalty_payments', 'medium'],
    ['ISBN mismatch', 'My book is showing a different ISBN on Amazon than what\'s on the physical copy.', 'isbn_metadata', 'high'],
    ['Bad print quality', 'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.', 'printing_quality', 'high'],
    ['Unavailable on Amazon', 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.', 'distribution_availability', 'high'],
    ['Stuck in typesetting', 'It\'s been 3 weeks and my book is still in typesetting. When will it be done?', 'book_status_production', 'medium'],
    ['Update description', 'Can I update the description of my book on Amazon after it\'s already live?', 'general_inquiry', 'low'],
  ];

  it.each(cases)('%s → %s / %s', (subject, description, category, priority) => {
    const r = triageByRules(subject, description);
    expect(r.category).toBe(category);
    expect(r.priority).toBe(priority);
  });

  it('flags long-overdue royalties as critical', () => {
    expect(triageByRules('No payment', "I haven't received any royalty for 6 months.").priority).toBe('critical');
    expect(triageByRules('No payment', "It's been more than a year and I haven't been paid any royalty.").priority).toBe('critical');
  });
});
