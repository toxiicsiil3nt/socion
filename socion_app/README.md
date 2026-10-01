# Socion

The consumer product: homepage → open-ended test → Claude typing → result.
The typing is done by Claude using `master_scoring_prompt.md` (repo root);
nothing in the browser or server scores a personality on its own.

## Run it

```bash
cd socion_app
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn server:app --port 8000
# open http://localhost:8000
```

To click through the whole flow without an API key or Stripe (QA only):

```bash
SOCION_FAKE_CLIENT=1 SOCION_DEV_MODE=1 uvicorn server:app --port 8000
```

`SOCION_FAKE_CLIENT` swaps Claude for a fixture that returns one of two
fixed reports (it does not type anyone). `SOCION_DEV_MODE` enables a
"Grant $40 / Grant $100" bar on the result page. Never set either in
production.

Tests (no API key needed):

```bash
pip install pytest httpx
python -m pytest tests -q
```

## Routes

| Route | What it does |
|---|---|
| `GET /` | Homepage narrative |
| `GET /test` | One question at a time; answers autosave in localStorage |
| `GET /result?id=…` | Result: the structure resolves into the person's Model A |
| `GET /api/questions` | The 8 prompts |
| `GET /api/config` | Whether payments / dev mode are on |
| `POST /api/type` | `{answers:[{id, answer}]}` → Claude → validated report, stored; returns the free view |
| `GET /api/report/{id}` | The report, filtered to what that report is entitled to |
| `POST /api/checkout` | Stripe Checkout URL, or `501` when Stripe isn't configured |
| `POST /api/webhook/stripe` | Grants the tier on `checkout.session.completed` |
| `POST /api/dev/grant` | Dev only; `404` unless `SOCION_DEV_MODE=1` |

## How a reading is produced

1. `scoring.run_single_pass` sends the answers with the master prompt as a
   cached system prompt (`claude-sonnet-5`, adaptive thinking).
2. `validate_report_schema` enforces master_scoring_prompt.md §4: all 8
   elements, all 4 blocks with each element used exactly once, a valid type
   code whose leading pair matches the Ego block, confidence 0–100, and a
   reasoning summary. One retry, then a safe `502`. Nothing partial is stored.
3. The full report is stored; the free view is filtered server-side
   (Ego block, its two elements' evidence, placement, confidence only).
4. $40 unlocks data the first call already produced (no new API call).
   $100 runs Skeptic → Synthesizer against the reading the customer already
   saw, in the background, and merges the revision delta.
5. Every generation appends a line to `data/usage_log.jsonl`: timestamp,
   report id, tier, model, input / cache-read / cache-write / output tokens,
   estimated USD. Margin per tier = price − sum of that tier's cost lines.

`measure_cost.py` gets exact token counts with `count_tokens` and runs one
real single pass and one verified pass (real, billed calls, well under $1).

## Files

- `scoring.py` — prompt construction, Claude calls, schema validation, tier filtering
- `store.py` — JSON-file report store + usage log (swap for a real DB before launch)
- `payments.py` — Stripe adapter; `NullPaymentAdapter` when `STRIPE_SECRET_KEY` is unset
- `server.py` — routes, rate limit, error handling
- `static/js/structure.js` — the shared Three.js structure (assemble / analyze / resolve into Model A)
- `static/js/theory.js` — element, position, and type vocabulary (static theory, never per-person claims)
- `static/js/home.js`, `test.js`, `result.js` — the three pages
- `static/vendor/` — Three.js r170, GSAP 3.12.5 + ScrollTrigger, self-hosted fonts
- `testing/fake_client.py`, `tests/test_pipeline.py` — QA fixture and pipeline tests

## Before launch

- **Stripe:** set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`,
  `pip install stripe`, point a webhook at `/api/webhook/stripe`.
- **Database:** `store.py` is a flat JSON file with a process lock.
- **Rate limiting:** in-memory per IP (6 readings / 10 min); use a shared
  store behind more than one worker.
- **Prompt IP:** master_scoring_prompt.md still quotes Aušra verbatim;
  paraphrase before charging for readings.
- **Account/email delivery:** reports live at their `/result?id=` link only.
