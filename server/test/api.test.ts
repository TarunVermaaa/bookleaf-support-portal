import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/client.js';
import { seedIfEmpty } from '../src/db/seed.js';

// Full HTTP tests against an in-memory Postgres (PGlite) seeded with the provided dataset.
// No ANTHROPIC_API_KEY in tests → this also exercises the "AI unavailable" degradation path.
const app = createApp();

async function login(email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

async function waitForTriage(agent: request.Agent, ticketId: string) {
  for (let i = 0; i < 50; i++) {
    const res = await agent.get(`/api/v1/tickets/${ticketId}`);
    if (res.body.aiStatus !== 'pending') return res.body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('triage did not finish');
}

let author: request.Agent;
let otherAuthor: request.Agent;
let admin: request.Agent;

beforeAll(async () => {
  await runMigrations();
  await seedIfEmpty();
  author = await login('priya.sharma@email.com', 'Author@123');
  otherAuthor = await login('rohit.kapoor@email.com', 'Author@123');
  admin = await login('admin@bookleafpub.com', 'Admin@123');
});

describe('auth', () => {
  it('rejects bad credentials with a generic message', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'priya.sharma@email.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({ code: 'UNAUTHENTICATED', message: 'Incorrect email or password' });
  });

  it('protects every API route', async () => {
    for (const path of ['/api/v1/books', '/api/v1/tickets', '/api/v1/admin/stats', '/api/v1/auth/me']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    }
  });
});

describe('author portal', () => {
  it('lists only the author\'s own books with royalty fields', async () => {
    const res = await author.get('/api/v1/books');
    expect(res.status).toBe(200);
    expect(res.body.items.map((b: { id: string }) => b.id)).toEqual(['BK001', 'BK002']);
    expect(res.body.items[0]).toMatchObject({ royaltyEarned: 11970, royaltyPaid: 8400, royaltyPending: 3570 });
  });

  it('validates ticket input with field-level errors', async () => {
    const res = await author.post('/api/v1/tickets').send({ subject: 'Hi', description: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['description', 'subject']);
  });

  it('cannot file a ticket against another author\'s book', async () => {
    const res = await author.post('/api/v1/tickets').send({
      bookId: 'BK003',
      subject: 'Royalty question',
      description: 'Why is my royalty for this book lower than expected this quarter?',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('bookId');
  });

  it('creates a ticket immediately and triages it even with the AI unavailable', async () => {
    const res = await author.post('/api/v1/tickets').send({
      bookId: 'BK001',
      subject: 'Different ISBN on Amazon',
      description: 'My book shows a different ISBN on Amazon than on the printed copy. Please check.',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    expect(res.body).not.toHaveProperty('priority'); // triage data is admin-only

    const triaged = await waitForTriage(admin, res.body.id);
    expect(triaged).toMatchObject({ category: 'isbn_metadata', priority: 'high', categorySource: 'rules', aiStatus: 'fallback' });
  });

  it('hides other authors\' tickets (404, not 403)', async () => {
    const created = await author.post('/api/v1/tickets').send({
      subject: 'Account question',
      description: 'How do I change the bank account linked to my dashboard?',
    });
    const res = await otherAuthor.get(`/api/v1/tickets/${created.body.id}`);
    expect(res.status).toBe(404);
    const list = await otherAuthor.get('/api/v1/tickets');
    expect(list.body.items.find((t: { id: string }) => t.id === created.body.id)).toBeUndefined();
  });
});

describe('admin portal', () => {
  it('forbids authors from admin actions', async () => {
    const list = await author.get('/api/v1/tickets');
    const id = list.body.items[0].id;
    expect((await author.patch(`/api/v1/tickets/${id}`).send({ status: 'closed' })).status).toBe(403);
    expect((await author.get('/api/v1/admin/stats')).status).toBe(403);
    expect((await author.get(`/api/v1/tickets/${id}/ai-draft`)).status).toBe(403);
  });

  it('sorts the queue by urgency (critical/high and oldest first)', async () => {
    const res = await admin.get('/api/v1/tickets?status=open,in_progress');
    const ranks = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
    const priorities = res.body.items.map((t: { priority: string }) => ranks[t.priority] ?? 4);
    expect(priorities).toEqual([...priorities].sort((a: number, b: number) => a - b));
  });

  it('filters by category and priority', async () => {
    const res = await admin.get('/api/v1/tickets?category=isbn_metadata&priority=high');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const t of res.body.items) expect(t).toMatchObject({ category: 'isbn_metadata', priority: 'high' });
  });

  it('overrides triage, assigns, notes internally and responds — author sees only the response', async () => {
    const created = await author.post('/api/v1/tickets').send({
      bookId: 'BK002',
      subject: 'Royalty breakdown request',
      description: 'Could you share a per-platform breakdown of my royalty for The Saffron Diaries?',
    });
    const id = created.body.id;
    await waitForTriage(admin, id);

    const me = (await admin.get('/api/v1/auth/me')).body.user;
    const patched = await admin.patch(`/api/v1/tickets/${id}`).send({ priority: 'low', assigneeId: me.id });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ priority: 'low', prioritySource: 'admin', assignee: { id: me.id } });

    // Re-running triage must not undo the human override
    const retriaged = await admin.post(`/api/v1/tickets/${id}/triage`);
    expect(retriaged.body).toMatchObject({ priority: 'low', prioritySource: 'admin' });

    await admin.post(`/api/v1/tickets/${id}/notes`).send({ body: 'Check Flipkart numbers before replying.' });
    const replied = await admin.post(`/api/v1/tickets/${id}/messages`).send({ body: 'Hi Priya, attaching your breakdown shortly.' });
    expect(replied.status).toBe(201);
    expect(replied.body.status).toBe('in_progress');

    const authorView = await author.get(`/api/v1/tickets/${id}`);
    expect(authorView.body.messages).toHaveLength(1);
    expect(authorView.body.messages[0].senderName).toBe('BookLeaf Support');
    expect(authorView.body).not.toHaveProperty('notes');
    expect(JSON.stringify(authorView.body)).not.toContain('Flipkart numbers');
  });

  it('reports the AI draft as unavailable instead of failing when AI is not configured', async () => {
    const list = await admin.get('/api/v1/tickets');
    const res = await admin.get(`/api/v1/tickets/${list.body.items[0].id}/ai-draft`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toMatch(/manually/);
  });

  it('returns stats including AI usage', async () => {
    const res = await admin.get('/api/v1/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.ai.configured).toBe(false);
    expect(res.body.tickets.byStatus.open).toBeGreaterThan(0);
  });
});
