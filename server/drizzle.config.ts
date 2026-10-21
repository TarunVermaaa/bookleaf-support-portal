import { defineConfig } from 'drizzle-kit';

// Used only by `npm run db:generate` to turn src/db/schema.ts into SQL migrations in ./drizzle.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
