import type { Request, Response } from 'express';
import type { SessionUser } from '../auth/session.js';
import { logger } from '../lib/logger.js';

/**
 * Real-time updates over Server-Sent Events.
 *
 * Why SSE: updates only flow server → browser (a new reply, a status change), SSE is plain HTTP,
 * reconnects automatically, and carries the session cookie — no extra auth handshake like WebSockets need.
 *
 * Events are small notifications ("ticket X changed"), not full payloads: the client refetches through
 * the normal REST API, so access control stays in one place and an event can never leak data.
 *
 * Scaling note: subscribers live in this process's memory. With more than one server instance this
 * would move to Redis pub/sub (or Postgres LISTEN/NOTIFY) — documented in the README.
 */
export type TicketEvent =
  | { type: 'ticket.created'; ticketId: string; authorId: string }
  | { type: 'ticket.updated'; ticketId: string; authorId: string }
  | { type: 'ticket.message'; ticketId: string; authorId: string };

interface Subscriber {
  user: SessionUser;
  res: Response;
}

const subscribers = new Set<Subscriber>();

export function subscribe(req: Request, res: Response, user: SessionUser) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx/Render)
  });
  res.write(`retry: 5000\n\n`);
  res.write(`event: ready\ndata: {}\n\n`);

  const sub: Subscriber = { user, res };
  subscribers.add(sub);

  // Comment heartbeats keep proxies from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    subscribers.delete(sub);
  });
}

/** Admins see every ticket event; an author only receives events for their own tickets. */
export function publish(event: TicketEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify({ ticketId: event.ticketId })}\n\n`;
  for (const sub of subscribers) {
    if (sub.user.role === 'admin' || sub.user.id === event.authorId) {
      try {
        sub.res.write(payload);
      } catch (err) {
        logger.warn('SSE write failed', { error: String(err) });
      }
    }
  }
}

export const subscriberCount = () => subscribers.size;
