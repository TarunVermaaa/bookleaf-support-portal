import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { aiCalls } from '../db/schema.js';
import { logger } from '../lib/logger.js';

/**
 * Thin wrapper around the Anthropic SDK. Everything the rest of the app needs from an LLM goes through
 * `complete()`, which adds the production concerns in one place:
 *   - the API key is read only from the server environment (never sent to the browser);
 *   - bounded latency (timeout) and bounded retries (SDK retries 429/5xx with backoff);
 *   - a circuit breaker so an outage fails fast instead of making every request wait for timeouts;
 *   - usage logging (tokens, latency, status) for every call → the `ai_calls` table;
 *   - typed failures (`AiUnavailableError`) that callers turn into graceful fallbacks.
 */
export type AiPurpose = 'triage' | 'draft';

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public readonly reason: 'not_configured' | 'circuit_open' | 'rate_limited' | 'api_error' | 'refusal' | 'bad_output',
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

// Server-side refusal fallbacks are available on these models only (see Anthropic docs).
const FALLBACK_CAPABLE = /^claude-(opus-5-5|opus-5|fable-5-1|sonnet-5-5)$/;

const client = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 2 })
  : null;

export const aiConfigured = () => client !== null;
export const aiModel = () => env.AI_MODEL;

// ---- Circuit breaker: after 3 consecutive failures, skip the AI for 60s ----
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let openUntil = 0;

export function breakerState() {
  return { open: Date.now() < openUntil, consecutiveFailures, reopensAt: openUntil || null };
}
function recordSuccess() {
  consecutiveFailures = 0;
  openUntil = 0;
}
function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_THRESHOLD) openUntil = Date.now() + BREAKER_COOLDOWN_MS;
}

export interface CompleteParams {
  purpose: AiPurpose;
  ticketId?: string;
  /** Stable instructions first (cacheable), then per-request system context. */
  system: { stable: string; dynamic?: string };
  user: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
  /** When set, the response is constrained to this JSON schema (structured outputs). */
  jsonSchema?: Record<string, unknown>;
}

export interface CompleteResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

async function logCall(row: {
  purpose: AiPurpose;
  ticketId?: string;
  status: 'ok' | 'error' | 'skipped';
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number;
  error?: string;
}) {
  try {
    await db.insert(aiCalls).values({ ...row, model: env.AI_MODEL });
  } catch (err) {
    // Logging must never break the request path.
    logger.warn('Failed to log AI call', { error: String(err) });
  }
}

export async function complete(params: CompleteParams): Promise<CompleteResult> {
  if (!client) {
    await logCall({ purpose: params.purpose, ticketId: params.ticketId, status: 'skipped', error: 'not_configured' });
    throw new AiUnavailableError('AI is not configured (ANTHROPIC_API_KEY missing)', 'not_configured');
  }
  if (breakerState().open) {
    await logCall({ purpose: params.purpose, ticketId: params.ticketId, status: 'skipped', error: 'circuit_open' });
    throw new AiUnavailableError('AI temporarily disabled after repeated failures', 'circuit_open');
  }

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    // The stable instructions are identical across requests of the same purpose, so they're marked for
    // prompt caching (a cache hit bills them at ~10% of the input price once the prefix is long enough).
    { type: 'text', text: params.system.stable, cache_control: { type: 'ephemeral' } },
  ];
  if (params.system.dynamic) system.push({ type: 'text', text: params.system.dynamic });

  const started = Date.now();
  try {
    const response = await client.beta.messages.create({
      model: env.AI_MODEL,
      max_tokens: params.maxTokens,
      system,
      messages: [{ role: 'user', content: params.user }],
      output_config: {
        effort: params.effort,
        ...(params.jsonSchema ? { format: { type: 'json_schema', schema: params.jsonSchema } } : {}),
      },
      // If the model's safety classifier declines, Anthropic re-runs the request on a recommended fallback model.
      ...(FALLBACK_CAPABLE.test(env.AI_MODEL)
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    });
    const latencyMs = Date.now() - started;
    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    };

    if (response.stop_reason === 'refusal') {
      recordFailure();
      await logCall({ purpose: params.purpose, ticketId: params.ticketId, status: 'error', latencyMs, ...usage, error: 'refusal' });
      throw new AiUnavailableError('The model declined this request', 'refusal');
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) {
      recordFailure();
      await logCall({ purpose: params.purpose, ticketId: params.ticketId, status: 'error', latencyMs, ...usage, error: `empty output (${response.stop_reason})` });
      throw new AiUnavailableError('The model returned no text', 'bad_output');
    }

    recordSuccess();
    await logCall({ purpose: params.purpose, ticketId: params.ticketId, status: 'ok', latencyMs, ...usage });
    return { text, model: response.model, usage };
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    recordFailure();
    const latencyMs = Date.now() - started;
    // Most specific first: rate limits and server errors are retryable later; the rest is a hard failure for now.
    const reason = err instanceof Anthropic.RateLimitError ? 'rate_limited' : 'api_error';
    const message =
      err instanceof Anthropic.APIError ? `${err.status ?? 'network'}: ${err.message}` : String(err);
    logger.warn('AI call failed', { purpose: params.purpose, reason, message });
    await logCall({ purpose: params.purpose, ticketId: params.ticketId, status: 'error', latencyMs, error: message.slice(0, 500) });
    throw new AiUnavailableError(message, reason);
  }
}
