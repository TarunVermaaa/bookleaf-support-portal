import { isTest } from '../config/env.js';

// Minimal structured logger: one JSON line per event, easy to grep locally and to parse on any log platform.
type Level = 'info' | 'warn' | 'error';

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (isTest) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
};
