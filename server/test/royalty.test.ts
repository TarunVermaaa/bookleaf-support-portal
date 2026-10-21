import { describe, expect, it } from 'vitest';
import { payoutCalendar, royaltyState } from '../src/ai/royalty-facts.js';

describe('payout calendar (quarterly, paid within 45 days)', () => {
  it('mid-Q4: last quarter is Jul–Sep, due 45 days after 30 Sep', () => {
    const cal = payoutCalendar(new Date('2026-10-21T10:00:00Z'));
    expect(cal.lastQuarterLabel).toBe('Jul–Sep 2026');
    expect(cal.lastQuarterEnd).toBe('2026-09-30');
    expect(cal.payoutDueBy).toBe('2026-11-14');
    expect(cal.nextQuarterLabel).toBe('Oct–Dec 2026');
    expect(cal.nextPayoutDueBy).toBe('2027-02-14');
  });

  it('in Q1, the last quarter is Oct–Dec of the previous year', () => {
    const cal = payoutCalendar(new Date('2027-01-10T00:00:00Z'));
    expect(cal.lastQuarterLabel).toBe('Oct–Dec 2026');
    expect(cal.payoutDueBy).toBe('2027-02-14');
  });
});

describe('royalty state', () => {
  const book = { status: 'Published & Live', royaltyPending: 0, royaltyEarned: 0, copiesSold: 0 };
  it('handles every edge case in the dataset', () => {
    expect(royaltyState({ ...book, status: 'In Production - Cover Design' })).toBe('in_production');
    expect(royaltyState(book)).toBe('no_sales');
    expect(royaltyState({ ...book, copiesSold: 189, royaltyEarned: 7938, royaltyPending: 0 })).toBe('fully_paid');
    expect(royaltyState({ ...book, copiesSold: 34, royaltyEarned: 850, royaltyPending: 850 })).toBe('below_threshold');
    expect(royaltyState({ ...book, copiesSold: 67, royaltyEarned: 2546, royaltyPending: 2546 })).toBe('payout_due');
  });
});
