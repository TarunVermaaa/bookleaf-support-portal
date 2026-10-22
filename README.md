# BookLeaf Author Support & Communication Portal

A web app that helps BookLeaf's operations team handle author queries faster and more consistently.
Authors see their books and royalties and raise support tickets; the support team works from a prioritised
queue where every ticket is **classified and scored by AI**, and every reply starts from an **AI draft grounded in
BookLeaf's knowledge base and the author's real book data** — which the admin reviews, edits and sends.

- **Live demo:** https://bookleaf-support-portal.onrender.com
- **API docs (Swagger UI):** https://bookleaf-support-portal.onrender.com/api/docs · raw spec: [`server/openapi.yaml`](server/openapi.yaml)
- **Write-up:** [`docs/WRITEUP.md`](docs/WRITEUP.md)

> **About the live demo and AI:** the deployed instance runs **without an LLM API key**, so it shows the
> graceful-degradation path. Tickets are classified by the keyword rules and labelled "Rules (AI offline)",
> and the draft panel asks the admin to reply manually. To see the AI path, set `ANTHROPIC_API_KEY`
> (locally in `.env`, or on Render as an environment variable). No code change is needed; the next ticket is
> triaged by the model, and "Re-run AI triage" upgrades existing ones. The server is on Render's free plan,
> so the first request after a quiet spell can take up to a minute.

## Test accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@bookleafpub.com` | `Admin@123` |
| Admin | `support@bookleafpub.com` | `Admin@123` |
| Author (any of the 10 authors in the dataset) | e.g. `priya.sharma@email.com` | `Author@123` |

Useful authors for edge cases: `ananya.reddy@email.com` (never paid, ₹2,546 pending), `sneha.kulkarni@email.com`
(a book still in cover design), `kavita.deshmukh@email.com` (a book in typesetting + ₹850 pending, below the ₹1,000 payout threshold).

The database is seeded with the provided dataset (10 authors, 18 books) plus five demo tickets based on the brief's
sample queries, so the admin queue isn't empty on first login.

---

## Run it locally

Requirements: **Node 20+**. No database to install — locally the server uses [PGlite](https://pglite.dev), an embedded
Postgres, so the same SQL runs locally and in production.

```bash
npm install
cp .env.example .env          # optional: add ANTHROPIC_API_KEY to enable AI
npm run dev                   # API on :4000, web on :5173 (proxied, same origin)
```

Open http://localhost:5173. Migrations and seeding run automatically on first start.

| Command | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm test` | 29 tests: API access rules, validation, degradation, prompt scoping, payout dates, triage fallback |
| `npm run build && npm start` | Production build: the API serves the built frontend on one port |
| `npm run db:generate` | Generate a SQL migration after changing `server/src/db/schema.ts` |

**Environment variables** (see `.env.example`): `DATABASE_URL` (empty → PGlite), `JWT_SECRET`, `ANTHROPIC_API_KEY`
(optional — without it the app runs in degraded mode), `AI_MODEL` (default `claude-opus-5-5`), `PORT`, `SEED_ON_BOOT`.

---

## Architecture

```
 Browser (React SPA)                         Node.js service (Express 5 + TypeScript)
 ┌─────────────────────┐   REST /api/v1   ┌──────────────────────────────────────────────┐
 │ Author portal       │ ───────────────▶ │ routes → validate (Zod) → auth / role checks │
 │ Admin portal        │ ◀── SSE events ─ │        → services → Drizzle ORM → PostgreSQL │
 └─────────────────────┘  /api/v1/events  │ ai/: triage · drafting · KB · rules fallback │──▶ Anthropic API
                                          └──────────────────────────────────────────────┘
```

```
server/src
  config/env.ts          env vars validated with Zod at startup (fail fast)
  db/                    schema (tables, enums, relations), client (pg or PGlite), seed
  auth/, middleware/     session cookie + JWT, requireAuth / requireRole, validation, error handler
  modules/               auth · books · tickets (routes → service) · admin stats
  ai/                    llm.ts (SDK wrapper), triage.ts, draft.ts, knowledge-base.ts, rules.ts, royalty-facts.ts
  realtime/events.ts     Server-Sent Events hub
web/src                  React + Vite: pages/author, pages/admin, api client, live-updates hook
```

### Decisions and why

- **One Node service serves the API and the built frontend.** One URL to deploy and test, and same-origin requests
  mean the session cookie works without CORS configuration.
- **TypeScript end to end, Express 5, Drizzle + PostgreSQL.** Relational data (authors → books → tickets → messages)
  fits Postgres; Drizzle keeps the schema in TypeScript and generates plain SQL migrations (`server/drizzle/`).
  Statuses, categories and priorities are **Postgres enums**, so invalid values can't be stored even by a buggy caller.
- **Schema highlights.** `ticket_messages` (author-visible conversation) and `internal_notes` are **separate tables**,
  so a forgotten filter can never leak a staff note to an author. Each ticket stores `category_source` /
  `priority_source` (`ai` · `rules` · `admin`): the UI shows where a value came from, and AI re-triage never
  overwrites an admin's override. `ai_calls` logs every model call with tokens and latency; `ai_drafts` caches the
  latest draft per ticket.
- **Auth: JWT in an httpOnly cookie**, not localStorage. Page scripts can't read it, and the browser sends it
  automatically — including on the SSE connection, which can't carry an `Authorization` header. Passwords are bcrypt hashes.
- **Authorisation in two layers.** `requireRole` guards admin-only routes; services scope every query by owner, so
  an author asking for someone else's ticket gets **404, not 403** (ids can't be probed).
- **Explicit DTOs.** Responses are built field by field: triage data, assignee and internal notes are only added for admins.
- **Real-time with Server-Sent Events.** Updates only flow server → browser; SSE is plain HTTP, reconnects on its own
  and uses the cookie. Events carry only a ticket id; the client refetches through the REST API, so access control stays
  in one place.
- **Consistent errors.** Every error is `{ "error": { "code", "message", "details?" } }` with the right status:
  400 (field-level details), 401, 403, 404, 409, 429, and a generic 500 that never leaks internals in production.

---

## AI integration

All model calls go through [`server/src/ai/llm.ts`](server/src/ai/llm.ts). The API key is read only from the server
environment; the browser never sees it or calls the model.

### 1. Auto-classification + priority ([`triage.ts`](server/src/ai/triage.ts))
- Runs **in the background** right after a ticket is created: the author gets an instant 201, and admins get an SSE
  update when triage finishes. A slow or failing AI never blocks ticket creation.
- One small call returns **category, priority and a one-line reason**, using **structured outputs** (a JSON schema
  with enums), then re-validated with Zod before it touches the database.
- The prompt carries the six category definitions and a **priority rubric written from BookLeaf's policies** (e.g. ISBN
  errors are always high, months of unpaid royalty are critical), plus a one-line summary of the selected book's state.
  It doesn't need the knowledge base, so it doesn't get it.
- Admins can override both values; overrides are stored as `admin` and survive re-triage.

### 2. AI-drafted responses ([`draft.ts`](server/src/ai/draft.ts), [`knowledge-base.ts`](server/src/ai/knowledge-base.ts))
- Generated when an admin opens a ticket, pre-filled in the reply box for editing, and sent only by the admin.
  Replies that started from a draft are flagged `aiAssisted`, which tells you how often drafts are actually used.
- **Prompt structure:**
  1. A stable system prompt with the reply rules (BookLeaf's tone guidelines turned into concrete instructions:
     acknowledge first, own mistakes, give timelines, end with a next step, never invent numbers).
  2. Only the **relevant knowledge-base sections** for the ticket's category, plus the brief's calibration example(s) for that category.
  3. A **facts block** computed in code: the author, the book's ISBN, status, MRP, copies sold, royalty
     earned/paid/pending, last payout, platforms, and for royalty tickets **the exact payout due date** (quarter end + 45 days)
     and the ₹1,000 threshold rule. The model never does date maths, so it can quote "by 14 November 2026"
     instead of "soon".
  4. The ticket and the last six messages of the conversation.
- Ticket text is wrapped in tags and the prompts say to treat it as information, not instructions (a basic
  prompt-injection guard).

### 3. Graceful degradation
| Failure | What happens |
| --- | --- |
| No `ANTHROPIC_API_KEY` | Tickets are triaged by keyword rules ([`rules.ts`](server/src/ai/rules.ts)), labelled **"Rules (AI offline)"**; the draft panel says to reply manually. |
| Timeout / 5xx / rate limit | The SDK retries twice with backoff (30s timeout). If it still fails → rules fallback for triage, "write manually" for drafts. |
| Repeated failures | A **circuit breaker** skips the AI for 60s after 3 consecutive failures, so admins don't wait on timeouts during an outage. |
| Invalid model output | Zod validation fails → rules fallback. |
| Refusal | Handled like a failure. On models that support it, the request opts into Anthropic's server-side refusal fallback. |

Tickets triaged by rules can be re-triaged with one click once the AI is back.

### 4. Cost awareness
- **Two call types, each sized to its job:** triage ≈ 450–600 input tokens at `effort: low`; drafts ≈ 1,000–1,200
  input tokens at `effort: medium`.
- **Knowledge base by category:** a draft sends ~350–475 tokens of the KB instead of all ~800 (about half). A test
  enforces that the selection stays well under the full KB.
- **No repeated work:** drafts are cached per ticket and regenerated only when the conversation changes or the admin
  asks; the conversation window is capped at the last 6 messages; long descriptions are trimmed.
- **Prompt caching:** stable instructions come first and are marked `cache_control`, so repeated prefixes are billed
  at the cache-read rate once they exceed the model's minimum cacheable length.
- **Guardrails and visibility:** draft/triage endpoints are rate limited (20/min per admin). Every call is logged
  in `ai_calls`, and the admin dashboard shows calls, success rate and an estimated cost for the last 7 days.

### 5. Model choice
The model is one env var (`AI_MODEL`). The default is **Claude Opus 5.5** (`claude-opus-5-5`): drafts go straight to
authors, so tone, factual accuracy and following the policy rules matter more than a fraction of a cent per reply,
and Claude follows long instruction lists and structured-output schemas reliably. Triage runs at `effort: low` with a
small prompt to keep it cheap. For higher volume, set `AI_MODEL=claude-haiku-5-5` for a much lower per-token price
without code changes.

---

## API

Base path `/api/v1`. Full reference with schemas and examples: **`/api/docs`** (Swagger UI, generated from
[`server/openapi.yaml`](server/openapi.yaml)).

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` · `/auth/logout` · GET `/auth/me` | all | Session cookie auth |
| GET | `/books` | author (own) / admin (all, `?authorId=`) | Books with royalty figures, totals, payout calendar |
| GET | `/tickets` | author (own) / admin (all) | Filters: `status, category, priority, assignee, from, to, search`; `sort=urgency\|newest\|oldest`; paging |
| POST | `/tickets` | author | Raise a ticket (201; triage in background) |
| GET | `/tickets/:id` | owner / admin | Ticket + conversation (+ internal notes for admins) |
| PATCH | `/tickets/:id` | admin | Status, category/priority override, assignee |
| POST | `/tickets/:id/messages` | owner / admin | Author follow-up or admin response |
| POST | `/tickets/:id/notes` | admin | Internal note |
| GET | `/tickets/:id/ai-draft[?regenerate=true]` | admin | Cached or fresh AI draft (`available: false` when AI is down) |
| POST | `/tickets/:id/triage` | admin | Re-run AI triage |
| GET | `/admin/stats` · `/admin/team` | admin | Queue health + AI usage · assignable admins |
| GET | `/events` | all | SSE stream of ticket changes |

---

## Product details
- **Authors:** a payout banner with the actual due date for the last quarter; per-book royalty state in plain words
  (e.g. "below the ₹1,000 threshold, rolls over"); books in production show "MRP set before publication" instead of ₹0;
  "raise a query about this book" pre-selects the book; replies appear live; replying to a resolved ticket reopens it.
- **Admins:** the default queue shows active tickets **most urgent first, then oldest**. Critical rows are marked,
  and tickets with no reply after 24h are highlighted. Every triage value shows its source (AI / Rules / Admin) with
  the AI's one-line reason. The author's book facts sit next to the conversation. Assign to me, internal notes,
  "Send & resolve".

## Testing
`npm test` runs Vitest against an in-memory Postgres seeded with the real dataset (no API key → it also exercises the
degraded path). Covered: authentication on every route, author/admin isolation (404 on other authors' tickets),
role checks (403), field-level validation errors, admin overrides surviving re-triage, internal notes never reaching
authors, the urgency sort, KB scoping and prompt facts, payout date calculation, and rule-based triage of every sample
query in the brief.

## Deployment
[`render.yaml`](render.yaml) is a Render Blueprint: one Node web service plus a managed Postgres. In Render:
New → Blueprint → this repo → set `ANTHROPIC_API_KEY`. The service runs migrations and seeds the dataset on first boot.

## Known limitations / next steps
- **Attachments** are UI-only (the file name is stored). Next: S3 pre-signed uploads, plus sending the image to the model for print-quality tickets.
- **SSE subscribers live in memory**, so real-time works for a single instance. For horizontal scaling, move to
  Redis pub/sub or Postgres `LISTEN/NOTIFY`.
- **Triage runs in-process.** A job queue (e.g. BullMQ or pg-boss) would add retries and survive restarts; today
  pending tickets are re-triaged on boot.
- **AI quality is checked by hand and by prompt-shape tests.** Next: an eval set of real past tickets (with the ops
  team's correct category and priority) to measure classification accuracy and catch prompt regressions.
- Email notifications to authors, SLA timers per priority, canned responses, and a password reset flow.
