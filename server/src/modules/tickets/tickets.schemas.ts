import { z } from 'zod';
import { CATEGORY_KEYS, PRIORITY_KEYS } from '../../ai/taxonomy.js';
import type { TicketCategory, TicketPriority } from '../../db/schema.js';

const STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const categoryEnum = z.enum(CATEGORY_KEYS as [TicketCategory, ...TicketCategory[]]);
const priorityEnum = z.enum(PRIORITY_KEYS as [TicketPriority, ...TicketPriority[]]);

// Accepts ?status=open&status=in_progress or ?status=open,in_progress
const csvList = <const V extends readonly [string, ...string[]]>(values: V) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)))
    .optional();

export const CreateTicketSchema = z.object({
  bookId: z.string().trim().min(1).nullish(), // null/absent = "General / Account Level"
  subject: z.string().trim().min(5, 'Subject should be at least 5 characters').max(150),
  description: z.string().trim().min(20, 'Please describe the issue in at least 20 characters').max(5000),
  // Upload is UI-only per the brief; we keep the file name so staff know an attachment was intended.
  attachmentName: z.string().trim().max(255).nullish(),
});
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export const ListTicketsSchema = z.object({
  status: csvList(STATUSES),
  category: csvList(CATEGORY_KEYS as [TicketCategory, ...TicketCategory[]]),
  priority: csvList(PRIORITY_KEYS as [TicketPriority, ...TicketPriority[]]),
  assignee: z.enum(['me', 'unassigned']).optional(),
  authorId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['urgency', 'newest', 'oldest']).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsSchema>;

export const UpdateTicketSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    category: categoryEnum.optional(),
    priority: priorityEnum.optional(),
    assigneeId: z.uuid().nullable().optional(), // null = unassign
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

export const MessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(5000),
  aiAssisted: z.boolean().optional(),
});

export const NoteSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(2000),
});

export const DraftQuerySchema = z.object({
  regenerate: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
