import { z } from 'zod';

// All configuration comes from environment variables and is validated once at startup,
// so a missing/invalid value fails fast instead of surfacing as a confusing runtime error later.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Empty → embedded Postgres (PGlite) for local development and tests.
  DATABASE_URL: z.string().optional().transform((v) => (v ? v : undefined)),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  // Optional: without a key the app runs in "AI unavailable" mode (rule-based triage, manual replies).
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  SEED_ON_BOOT: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse({
    ...process.env,
    // Tests and first-run local dev get a throwaway secret; production must set its own.
    JWT_SECRET:
      process.env.JWT_SECRET ?? (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret-change-me'),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
