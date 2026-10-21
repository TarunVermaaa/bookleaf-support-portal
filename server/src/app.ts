import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { aiConfigured } from './ai/llm.js';
import { currentUser, requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { booksRouter } from './modules/books/books.routes.js';
import { ticketsRouter } from './modules/tickets/tickets.routes.js';
import { subscribe } from './realtime/events.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render's proxy: needed for secure cookies and rate-limit IPs
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'script-src': ["'self'", "'unsafe-inline'"] },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // ---- API v1 ----
  const api = Router();
  api.get('/health', (_req, res) => res.json({ status: 'ok', ai: aiConfigured() ? 'configured' : 'not_configured' }));
  api.use('/auth', authRouter);
  api.use('/books', booksRouter);
  api.use('/tickets', ticketsRouter);
  api.use('/admin', adminRouter);
  // SSE stream of ticket change notifications for the logged-in user
  api.get('/events', requireAuth, (req, res) => subscribe(req, res, currentUser(req)));
  app.use('/api/v1', api);

  // ---- API docs (OpenAPI 3) ----
  const specPath = path.resolve(here, '../openapi.yaml');
  if (existsSync(specPath)) {
    const spec = YAML.parse(readFileSync(specPath, 'utf8'));
    app.get('/api/openapi.json', (_req, res) => res.json(spec));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'BookLeaf Support API' }));
  }
  app.use('/api', notFoundHandler);

  // ---- Frontend (production build served by the same service: one URL, same-origin cookies) ----
  const webDist = path.resolve(here, '../../web/dist');
  if (existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // Client-side routing: any non-API GET returns index.html
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
