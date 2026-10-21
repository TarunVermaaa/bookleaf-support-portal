// `npm run db:seed` — apply migrations and seed the sample dataset into an empty database.
import { closeDb, runMigrations } from './client.js';
import { seedIfEmpty } from './seed.js';

await runMigrations();
const { seeded } = await seedIfEmpty();
console.log(seeded ? 'Seeded sample dataset.' : 'Database already has data — nothing to do.');
await closeDb();
