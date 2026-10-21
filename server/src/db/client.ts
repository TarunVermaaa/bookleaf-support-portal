import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import { env, isTest } from '../config/env.js';
import * as schema from './schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both src/db (tsx) and dist/db (compiled): migrations live in server/drizzle.
const migrationsFolder = path.resolve(here, '../../drizzle');

/**
 * Two drivers, one query API:
 * - Production: a real Postgres via DATABASE_URL (node-postgres pool).
 * - Local dev / tests: PGlite, an embedded WASM build of Postgres — same SQL dialect, zero setup.
 *   Dev data persists in server/.pglite; tests use an in-memory instance.
 * Both expose the same Drizzle query builder, so the rest of the code never knows which one it has.
 */
export type DB = NodePgDatabase<typeof schema>;

// Managed providers need TLS on their public hostnames (e.g. *.render.com, *.neon.tech, or ?sslmode=require).
// Local databases and Render's private network hostnames (no dots, e.g. "dpg-abc123-a") don't.
function needsTls(url: string) {
  if (/sslmode=(require|verify)/.test(url)) return true;
  const host = new URL(url).hostname;
  return host.includes('.') && !/^(localhost|127\.0\.0\.1)$/.test(host);
}

function createDb() {
  if (env.DATABASE_URL) {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: needsTls(env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      migrate: () => migratePg(db, { migrationsFolder }),
      close: () => pool.end(),
    };
  }
  const client = isTest ? new PGlite() : new PGlite(path.resolve(here, '../../.pglite'));
  const db = drizzlePglite(client, { schema });
  return {
    // The PGlite and node-postgres Drizzle instances share the same query-builder surface.
    db: db as unknown as DB,
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}

const instance = createDb();

export const db = instance.db;
export const runMigrations = instance.migrate;
export const closeDb = instance.close;
