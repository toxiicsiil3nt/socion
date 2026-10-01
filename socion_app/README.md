# Socion backend (MVP)

Turns the open-ended questionnaire into a real Model A report, using
`master_scoring_prompt.md` (repo root) as the scoring engine and
`socionics_debate.py`'s Typist → Skeptic → Synthesizer protocol for the
$100 "Verified" tier.

## Run it

```bash
cd socion_app
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...      # or `ant auth login` once, no env var needed
uvicorn server:app --reload --port 8000
```

Open http://localhost:8000/ — answer the questions, pick a tier, submit.

## Files

- `scoring.py` — the pipeline: load the cached system prompt, run a single
  Typist pass or the full debate protocol, parse the JSON out of the
  response, merge the Synthesizer's revision-delta onto the Typist's
  original report, and filter the result down to what each tier paid for.
- `server.py` — one FastAPI endpoint (`POST /api/type`) plus static file
  serving for the quiz page.
- `static/notation.js` — the geometric element notation (square/circle/
  triangle/notch, black/white), extracted from `scratch/socion-landing.html`
  so marketing and product never visually drift apart.
- `static/quiz.html` — the intake form + report renderer.
- `measure_cost.py` — priority #2: exact token counts and real per-tier
  cost, using `count_tokens` instead of estimating from file size.
  **Running it makes real, billed API calls** (one single-pass report, one
  full 3-stage verified debate) — small cost (expected well under $1 total)
  but not free. Run it once you have a key, review the printed numbers
  before trusting any pricing-margin claim.

## What's still a placeholder

- **No payment gating.** The `tier` field is currently just sent by the
  client — anyone can POST `tier: "verified"` for free. Before this is
  public, the tier must be set server-side from a verified Stripe payment
  (checkout session → webhook → one-time token tied to that tier), not
  trusted from the request body.
- **No persistence.** Reports aren't saved anywhere; refresh and it's gone.
  Fine for local testing, not fine for "email me my report" or refund
  support ("what did they actually receive").
- **No rate limiting / abuse protection** on `/api/type` — a public
  deployment needs this before launch, since each call costs real money.
- **Quotations in `master_scoring_prompt.md` are still verbatim Aušra
  text** — priority #3 from the roadmap, unstarted. Don't launch paid
  traffic against this prompt file until that's paraphrased.
