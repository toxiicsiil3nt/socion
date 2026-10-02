# Socion — what happened in earlier sessions

Short history so a new session gets the gist without the old chat.
Rules and decisions live in `CLAUDE.md`; this file is background only.
Read it when the user refers to past work ("like before", "the portraits").

## Session 1 (cloud, 2026) — built the product
- Strategy: TikTok/YouTube plan; Enneagram only as "Socionics vs Enneagram"
  comparison content. Marketing-council review → lead with "the AI
  cross-examines its own reading", then 8-channel visuals, then duality.
- Costs: Claude call per reading is cents; hosting is small. Measure for
  real with `measure_cost.py` once an API key is set (billed; ask first).
- Refunds: none after delivery (it's a digital download), except
  technical failure; EU withdrawal-waiver checkbox at checkout.
- Backend: FastAPI app in `socion_app/` (see its README). 12 passing tests.
  The real Claude path has **never run** yet — no key was available.
- Frontend: narrative homepage (word "Socionics" held back until section
  03), one-question-per-screen test, result page where a Three.js
  "structure" assembles and resolves into the person's Model A.
- Style: dark tactile/neo-skeuomorphic, copper accents, warm glow, line-art
  notation. Built from user-supplied style boards.
- Preview artifact (sample result only):
  https://claude.ai/artifact/Bq7RUhvf64ahG8g9owH5fK
- Moved to the user's PC: repo `github.com/toxiicsiil3nt/socion`, branch
  `claude/aushra-augusta-socionics-txocar`. User is on Windows, Python 3.14,
  prefers not to use cmd; runs the app with uvicorn (see CLAUDE.md).

## Midjourney type portraits (end of session 1)
- File: `marketing/midjourney-type-portraits.md` — 16 prompts, one
  imagined character per type, built from each type's Base + Creative.
- Style: `--sref 4278289982 --sw 1000 --ar 2:3`, gritty sketchy comic
  portraits. Lessons learned the hard way:
  - no `--v 6.1` (old version maps the code to a 3D/neon style);
  - never put type codes in prompts (Midjourney letters them on the image);
  - describe a concrete person (age, face, expression, posture, hands,
    prop, setting), not abstract traits — the user asked for this;
  - `--no text, letters, words, typography, logo`; `--sw 500` if too cartoony.
- Status: user was testing the prompts. Next: rework any that miss, then put
  the finished portraits into the homepage's 16-type section.
