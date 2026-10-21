import { eq } from 'drizzle-orm';
import { createApp } from './app.js';
import { aiConfigured, aiModel } from './ai/llm.js';
import { env } from './config/env.js';
import { closeDb, db, runMigrations } from './db/client.js';
import { tickets } from './db/schema.js';
import { seedIfEmpty } from './db/seed.js';
import { logger } from './lib/logger.js';
import { runTriage } from './modules/tickets/tickets.service.js';

async function main() {
  await runMigrations();
  if (env.SEED_ON_BOOT) await seedIfEmpty();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info('BookLeaf support portal running', {
      port: env.PORT,
      ai: aiConfigured() ? `enabled (${aiModel()})` : 'disabled — rule-based triage, manual replies',
    });
  });

  // Tickets that were created while the server was down (or seeded) still need triage.
  void (async () => {
    const pending = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.aiStatus, 'pending'));
    for (const t of pending) await runTriage(t.id).catch((err) => logger.warn('Startup triage failed', { id: t.id, error: String(err) }));
  })();

  const shutdown = () => {
    logger.info('Shutting down');
    server.close(() => void closeDb().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start', { error: String(err) });
  process.exit(1);
});
