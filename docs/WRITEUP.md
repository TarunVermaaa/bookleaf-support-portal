# Approach — BookLeaf Author Support Portal

**What I prioritised.** The brief's core problem is that author queries pile up and get inconsistent answers. So I
built the ticket lifecycle end to end first (author raises → AI triages → admin replies → author sees it live), and
spent most of the remaining time on making the AI part trustworthy rather than flashy. Three principles guided it:

1. **The AI never blocks the work.** Tickets are created instantly and triaged in the background. If the model is down,
   rate-limited, misconfigured or returns something invalid, keyword rules take over and are clearly labelled, and
   admins reply manually. A circuit breaker stops the app from waiting on timeouts during an outage.
2. **The AI drafts, a human decides.** Admins can override any classification (and re-triage won't undo it), and
   drafts are only ever sent after an admin has read and edited them.
3. **Ground every reply in facts.** The biggest risk in support replies is a confident wrong number or date. So
   the code, not the model, computes the facts (the author's royalty figures, book status, the exact next payout date
   under the quarterly + 45-day rule, the ₹1,000 threshold), and the prompt forbids inventing anything else. The tone
   guidelines became concrete instructions, and the brief's sample responses are included as calibration examples for
   each category.

**Trade-offs I made.**
- *Cost vs quality:* triage uses a tiny prompt at low effort. Drafts include only the knowledge-base sections relevant
  to the ticket's category (about half the KB), and are cached until the conversation changes. The model is configurable
  (`AI_MODEL`): the default favours reply quality, and a cheaper model is a one-line change.
- *Simplicity vs scale:* one Node service serves both API and frontend, real-time uses Server-Sent Events from memory,
  and triage runs in-process. That's right for one instance and easy to review. The README lists the exact changes
  for scaling out (Redis/`LISTEN/NOTIFY` for events, a job queue for triage).
- *Attachments* are UI-only, as the brief allowed.
- *Local setup:* an embedded Postgres (PGlite) means reviewers can run it with `npm install && npm run dev`, while
  production uses a real Postgres with the same migrations.

**How I'd take it to production.**
- **Measure the AI.** Build an evaluation set from real historical tickets, labelled by the ops team, and track
  classification accuracy and draft acceptance before and after any prompt or model change. The `ai_calls` log and the
  `aiAssisted` flag on replies already record what's needed.
- **Close the loop with ops:** SLA timers per priority, escalation to the production team for ISBN issues straight
  from the ticket, canned responses, and email/WhatsApp notifications to authors.
- **Connect to real systems:** pull live royalty and production data from BookLeaf's dashboard (today: the seeded
  dataset), process attachments (photos of misprints go straight to the model), and move to SSO for staff.
- **Harden:** a job queue for AI work with retries and dead-lettering, Redis-backed rate limits and events, structured
  logging and alerting on AI error rates, and per-author rate limits on ticket creation.
