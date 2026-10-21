import type { TicketCategory, TicketPriority } from '../db/schema.js';

/**
 * Rule-based triage used when the AI is unavailable (no API key, outage, rate limit, invalid output).
 * Deliberately simple and transparent: keyword scores for category, a few high-signal patterns for priority.
 * It is a safety net, not a replacement — tickets triaged this way are marked "rules" so admins know to double-check.
 */
const CATEGORY_KEYWORDS: Record<Exclude<TicketCategory, 'general_inquiry'>, RegExp[]> = {
  royalty_payments: [/royalt/i, /payout/i, /payment/i, /\bpaid\b/i, /\bbank\b/i, /earning/i, /₹|\brs\.?\s?\d|\binr\b/i],
  isbn_metadata: [/\bisbn\b/i, /metadata/i, /wrong (title|author|book|price)/i, /author name/i, /mismatch/i],
  printing_quality: [/print(ing|ed)? quality/i, /misprint/i, /blurr?y/i, /binding/i, /damaged/i, /defect/i, /colou?r/i, /pages? (are )?(missing|misaligned)/i, /author cop(y|ies)/i],
  distribution_availability: [/unavailable/i, /not available/i, /out of stock/i, /not (showing|visible|listed)/i, /can'?t find/i, /go(ne)? live/i, /listing (is )?(missing|down|removed)/i],
  book_status_production: [/typesett/i, /proofread/i, /cover design/i, /editing/i, /production/i, /\bstage\b/i, /still in/i, /when will/i, /status/i],
};

const STRONG_SIGNALS: [RegExp, TicketCategory][] = [
  [/\bisbn\b/i, 'isbn_metadata'],
  [/misprint|blurr?y|binding|misaligned|print(ing)? quality/i, 'printing_quality'],
  [/(currently )?unavailable on|out of stock/i, 'distribution_availability'],
];

const CRITICAL = [
  /(no|not|haven'?t|never|didn'?t)\b.{0,40}\b(royalt|payment|paid)\w*.{0,40}\b([6-9]|1[0-9]|six|seven|eight|nine|ten|twelve)\s*(months?)\b/i,
  /(no|not|haven'?t|never|didn'?t)\b.{0,60}\b(royalt|payment|paid)\w*[\s\S]{0,80}\b(a|over a|more than a|one|1)\s*years?\b/i,
  /\b(a|over a|more than a)\s*year\b[\s\S]{0,80}\b(no|not|haven'?t|never)\b.{0,40}\b(royalt|payment|paid)/i,
  /\b(legal|lawyer|lawsuit|fraud|scam|police|consumer court)\b/i,
  /wrong (author|book) (is )?(linked|attached|listed)/i,
];
const HIGH = [
  /\bisbn\b/i,
  /misprint|defect|damaged|blurr?y|binding|misaligned/i,
  /(currently )?unavailable|not available|out of stock/i,
  /(haven'?t|not|never) (yet )?(received|got|been paid)/i,
  /overdue|delayed payment|missing payment/i,
];
const LOW = [/\bbio\b/i, /profile/i, /description/i, /how (do|can) i/i, /^can i\b/i, /just (a )?question/i, /suggestion|feature request/i];

export interface RuleTriage {
  category: TicketCategory;
  priority: TicketPriority;
  reasoning: string;
}

export function triageByRules(subject: string, description: string): RuleTriage {
  const text = `${subject}\n${description}`;

  // A few signals are unambiguous on their own — e.g. any ISBN problem is an ISBN issue even if the author
  // also mentions Amazon. Check them before the keyword scoring.
  const strong = STRONG_SIGNALS.find(([re]) => re.test(text));
  let category: TicketCategory = strong ? strong[1] : 'general_inquiry';
  let best = strong ? Number.POSITIVE_INFINITY : 0;
  for (const [key, patterns] of Object.entries(CATEGORY_KEYWORDS) as [TicketCategory, RegExp[]][]) {
    // Subject matches count double: authors usually name the problem there.
    const score = patterns.reduce((s, re) => s + (re.test(subject) ? 2 : 0) + (re.test(description) ? 1 : 0), 0);
    if (score > best) {
      best = score;
      category = key;
    }
  }

  let priority: TicketPriority = 'medium';
  if (CRITICAL.some((re) => re.test(text))) priority = 'critical';
  else if (HIGH.some((re) => re.test(text))) priority = 'high';
  else if (LOW.some((re) => re.test(text))) priority = 'low';

  return {
    category,
    priority,
    reasoning: 'Classified by keyword rules because the AI service was unavailable — please review.',
  };
}
