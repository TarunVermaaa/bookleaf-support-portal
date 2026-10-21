import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { uuidParam, validate, validatedQuery } from '../../middleware/validate.js';
import * as service from './tickets.service.js';
import {
  CreateTicketSchema,
  DraftQuerySchema,
  ListTicketsSchema,
  MessageSchema,
  NoteSchema,
  UpdateTicketSchema,
  type ListTicketsQuery,
} from './tickets.schemas.js';

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

// Regenerating drafts costs money: cap it per user so a stuck button or script can't run up a bill.
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.user?.id ?? 'anon',
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many AI requests. Please wait a minute.' } });
  },
});

// GET /tickets — authors: their own tickets; admins: the full queue with filters
ticketsRouter.get('/', validate('query', ListTicketsSchema), async (req, res) => {
  const user = currentUser(req);
  const query = validatedQuery<ListTicketsQuery>(req);
  // Default sort: newest for authors, most urgent first for admins — unless the client asks otherwise.
  const sort = req.query.sort ? query.sort : user.role === 'admin' ? 'urgency' : 'newest';
  res.json(await service.listTickets(user, { ...query, sort }));
});

// POST /tickets — authors raise a ticket (201 immediately; AI triage runs in the background)
ticketsRouter.post('/', requireRole('author'), validate('body', CreateTicketSchema), async (req, res) => {
  res.status(201).json(await service.createTicket(currentUser(req), req.body));
});

ticketsRouter.get('/:id', validate('params', uuidParam), async (req, res) => {
  res.json(await service.getTicket(currentUser(req), req.params.id as string));
});

// PATCH /tickets/:id — admins: status, category/priority override, assignment
ticketsRouter.patch(
  '/:id',
  requireRole('admin'),
  validate('params', uuidParam),
  validate('body', UpdateTicketSchema),
  async (req, res) => {
    res.json(await service.updateTicket(currentUser(req), req.params.id as string, req.body));
  },
);

// POST /tickets/:id/messages — author follow-up or admin response (visible to the author)
ticketsRouter.post('/:id/messages', validate('params', uuidParam), validate('body', MessageSchema), async (req, res) => {
  res.status(201).json(await service.addMessage(currentUser(req), req.params.id as string, req.body));
});

// POST /tickets/:id/notes — internal notes, never visible to authors
ticketsRouter.post(
  '/:id/notes',
  requireRole('admin'),
  validate('params', uuidParam),
  validate('body', NoteSchema),
  async (req, res) => {
    res.status(201).json(await service.addNote(currentUser(req), req.params.id as string, req.body.body));
  },
);

// GET /tickets/:id/ai-draft — cached draft, or a new one if none exists / the conversation changed.
// ?regenerate=true forces a fresh draft.
ticketsRouter.get(
  '/:id/ai-draft',
  requireRole('admin'),
  aiLimiter,
  validate('params', uuidParam),
  validate('query', DraftQuerySchema),
  async (req, res) => {
    const { regenerate } = validatedQuery<{ regenerate: boolean }>(req);
    res.json(await service.getDraft(currentUser(req), req.params.id as string, { regenerate }));
  },
);

// POST /tickets/:id/triage — re-run AI classification (admin overrides are kept)
ticketsRouter.post('/:id/triage', requireRole('admin'), aiLimiter, validate('params', uuidParam), async (req, res) => {
  await service.getTicket(currentUser(req), req.params.id as string); // 404 if missing
  await service.runTriage(req.params.id as string);
  res.json(await service.getTicket(currentUser(req), req.params.id as string));
});
