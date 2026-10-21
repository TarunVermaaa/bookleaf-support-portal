// Shapes returned by the API (see server/openapi.yaml).
export type Role = 'author' | 'admin';
export type Status = 'open' | 'in_progress' | 'resolved' | 'closed';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Category =
  | 'royalty_payments'
  | 'isbn_metadata'
  | 'printing_quality'
  | 'distribution_availability'
  | 'book_status_production'
  | 'general_inquiry';
export type TriageSource = 'ai' | 'rules' | 'admin';

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
}

export interface Book {
  id: string;
  title: string;
  isbn: string;
  genre: string;
  publicationDate: string | null;
  status: string;
  inProduction: boolean;
  mrp: number | null;
  royaltyPerCopy: number | null;
  copiesSold: number;
  royaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastPayoutDate: string | null;
  royaltyState: 'in_production' | 'no_sales' | 'fully_paid' | 'below_threshold' | 'payout_due';
  royaltyNote: string;
  printPartner: string | null;
  availableOn: string[];
  authorName?: string;
}

export interface PayoutCalendar {
  lastQuarterLabel: string;
  lastQuarterEnd: string;
  payoutDueBy: string;
  nextQuarterLabel: string;
  nextPayoutDueBy: string;
}

export interface BooksResponse {
  items: Book[];
  totals: { copiesSold: number; royaltyEarned: number; royaltyPaid: number; royaltyPending: number };
  payoutCalendar: PayoutCalendar;
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  description: string;
  status: Status;
  book: { id: string; title: string | null } | null;
  attachmentName: string | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  // admin-only
  author?: { id: string; name: string; email: string };
  category?: Category | null;
  categorySource?: TriageSource | null;
  priority?: Priority | null;
  prioritySource?: TriageSource | null;
  aiStatus?: 'pending' | 'done' | 'fallback';
  aiReasoning?: string | null;
  assignee?: { id: string; name: string | null } | null;
}

export interface Message {
  id: string;
  body: string;
  senderRole: Role;
  senderName: string;
  aiAssisted?: boolean;
  createdAt: string;
}

export interface Note {
  id: string;
  body: string;
  adminName: string;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  messages: Message[];
  notes?: Note[];
}

export interface TicketList {
  items: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

export type AiDraft =
  | { available: true; cached: boolean; body: string; model: string; kbSections: string[]; createdAt: string }
  | { available: false; reason: string };

export interface AdminStats {
  tickets: {
    byStatus: Partial<Record<Status, number>>;
    activeByPriority: Partial<Record<Priority | 'untriaged', number>>;
    unassignedActive: number;
    avgFirstResponseMinutes: number | null;
    triagedByRules: number;
  };
  ai: {
    configured: boolean;
    model: string;
    circuitBreaker: { open: boolean; consecutiveFailures: number };
    last7Days: {
      purpose: 'triage' | 'draft';
      model: string;
      calls: number;
      ok: number;
      skipped: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      avgLatencyMs: number;
      estimatedCostUsd: number | null;
    }[];
  };
}
