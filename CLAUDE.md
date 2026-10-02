# Socion — project rules for Claude

Socion is a consumer site that types people with **classical Socionics**:
Aušra Augustinavičiūtė's Model A (1980–1986 sources). This repo is a fork of
the Claude Code repo; the Socion work lives in `master_scoring_prompt.md`,
`socionics_debate.py`, and `socion_app/`. Ignore the unrelated Claude Code
files unless asked.

## Hard rules
- **Classical only.** No Gulenko (Model G, DCNH, cognitive styles,
  process/result), no Bukalov (Model B, subtypes), no dimensionality theory
  in the engine. Enneagram never enters the engine; it may appear only as
  adversarial comparison content.
- **The AI does the typing.** Results come only from Claude reading the
  user's own words via `master_scoring_prompt.md`, strictly validated against
  its §4 JSON schema. Never add keyword scoring, quiz math, hardcoded or
  random results. Demo content must be visibly labeled as a sample.
- **Never claim more than the JSON supports.** Per-person statements come
  from the validated report; everything else is the static meaning of a
  Model A position (`socion_app/static/js/theory.js`).
- **Secrets stay server-side.** The master prompt, `ANTHROPIC_API_KEY`, and
  Stripe keys never reach the browser.
- The free tier is filtered on the server; paid fields never leave it.
- The 3D structure is a visual metaphor, never presented as a brain scan.

## Decisions already made
- Pricing: Free (type, Ego block, evidence from own words) / $40 full Model A
  / $100 verified (Skeptic → Synthesizer review of the reading the customer
  already saw). One-time payments, no subscriptions. No refund after
  delivery except technical failure; EU withdrawal-waiver checkbox at checkout.
- $40 unlocks data the first Claude call already produced (no extra cost).
- Every AI call is logged (tokens, model, tier, estimated cost) in
  `socion_app/data/usage_log.jsonl` to measure margin per tier.
- Visual identity: dark tactile surfaces, copper accents, warm under-glow;
  the 3D structure and Aušra's notation stay as line art. Notation: square =
  logic, circle = sensing, triangle = intuition, notched square = ethics;
  filled = extraverted, outline = introverted.
- Homepage narrative withholds the word "Socionics" until section 03.
- Marketing lead: "the AI cross-examines its own reading", then the
  8-channel visuals, then duality/relationships.

## Where things are
- `master_scoring_prompt.md` — scoring engine: element semantics, Model A
  blocks, natural vs. normative language test, guardrails, §4 schema,
  §6 Typist → Skeptic → Synthesizer protocol.
- `socion_app/README.md` — architecture, routes, how a reading is produced.
  Read it before changing the backend.
- `socion_app/scoring.py` (Claude calls, validation, tier filter),
  `server.py`, `store.py`, `payments.py`, `static/` (pages + `js/structure.js`).
- `SESSION_LOG.md` — short history of past sessions. Read it only when the
  user refers to earlier work; append a few lines at the end of a session.

## Running and testing
- App: `cd socion_app`, set `ANTHROPIC_API_KEY`, then
  `python -m uvicorn server:app --port 8000` → http://localhost:8000
- No-key QA: set `SOCION_FAKE_CLIENT=1` and `SOCION_DEV_MODE=1` (on Windows
  cmd, use separate `set` lines). Never in production.
- Tests: `python -m pytest tests -q` from `socion_app/` (needs pytest, httpx).
- `measure_cost.py` makes real, billed calls; ask before running it.
- For UI changes, run the app and check it in a browser (desktop and mobile
  widths) before calling the work done.

## Open work (priority order)
1. Real readings with a real API key; run `measure_cost.py` for exact cost.
2. Paraphrase the verbatim Aušra quotations in `master_scoring_prompt.md`
   before charging for readings.
3. Stripe keys + webhook (`/api/webhook/stripe`).
4. Real database instead of `data/reports.json`; email delivery of reports.
5. TikTok/YouTube content.
6. Type portraits: finish the Midjourney set
   (`marketing/midjourney-type-portraits.md`), then add them to the site.

## Working style
- Keep answers short; one specific goal per session.
- Git remote `origin` is github.com/toxiicsiil3nt/socion.
