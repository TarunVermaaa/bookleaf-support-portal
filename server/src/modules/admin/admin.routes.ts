import { count, eq, gte, sql } from 'drizzle-orm';
import { Router } from 'express';
import { aiConfigured, aiModel, breakerState } from '../../ai/llm.js';
import { db } from '../../db/client.js';
import { aiCalls, tickets } from '../../db/schema.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { listAdmins } from '../tickets/tickets.service.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

// Approximate list prices (USD per million tokens) for the cost estimate shown to ops. Estimates only.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

// GET /admin/team — admins that tickets can be assigned to
adminRouter.get('/team', async (_req, res) => {
  res.json({ items: await listAdmins() });
});

// GET /admin/stats — queue health and AI usage for the dashboard header
adminRouter.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86_400_000);

  const [byStatus, byPriority, [unassigned], [response], aiByPurpose] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    db
      .select({ priority: tickets.priority, n: count() })
      .from(tickets)
      .where(sql`${tickets.status} in ('open','in_progress')`)
      .groupBy(tickets.priority),
    db.select({ n: count() }).from(tickets).where(sql`${tickets.assigneeId} is null and ${tickets.status} in ('open','in_progress')`),
    db
      .select({
        avgMinutes: sql<number | null>`avg(extract(epoch from (${tickets.firstResponseAt} - ${tickets.createdAt})) / 60)::float`,
      })
      .from(tickets)
      .where(sql`${tickets.firstResponseAt} is not null`),
    db
      .select({
        purpose: aiCalls.purpose,
        model: aiCalls.model,
        calls: count(),
        ok: sql<number>`count(*) filter (where ${aiCalls.status} = 'ok')::int`,
        inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}),0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}),0)::int`,
        cacheReadTokens: sql<number>`coalesce(sum(${aiCalls.cacheReadTokens}),0)::int`,
        avgLatencyMs: sql<number>`coalesce(avg(${aiCalls.latencyMs}) filter (where ${aiCalls.status} = 'ok'),0)::int`,
      })
      .from(aiCalls)
      .where(gte(aiCalls.createdAt, since))
      .groupBy(aiCalls.purpose, aiCalls.model),
  ]);

  const ai = aiByPurpose.map((r) => {
    const price = PRICE_PER_MTOK[r.model];
    const estUsd = price ? (r.inputTokens * price.input + r.outputTokens * price.output) / 1_000_000 : null;
    return { ...r, estimatedCostUsd: estUsd === null ? null : Number(estUsd.toFixed(4)) };
  });

  const [fallbackTickets] = await db.select({ n: count() }).from(tickets).where(eq(tickets.aiStatus, 'fallback'));

  res.json({
    tickets: {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
      activeByPriority: Object.fromEntries(byPriority.map((r) => [r.priority ?? 'untriaged', r.n])),
      unassignedActive: unassigned.n,
      avgFirstResponseMinutes: response.avgMinutes === null ? null : Math.round(response.avgMinutes),
      triagedByRules: fallbackTickets.n,
    },
    ai: {
      configured: aiConfigured(),
      model: aiModel(),
      circuitBreaker: breakerState(),
      last7Days: ai,
    },
  });
});
