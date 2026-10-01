"""
server.py — Socion backend.

Pages
    GET  /                      homepage
    GET  /test                  one-question-at-a-time questionnaire
    GET  /result?id=<report_id> result page (free view, upgrades in place)

API
    GET  /api/questions         the questionnaire (prompts only)
    GET  /api/config            what's configured (payments, dev mode)
    POST /api/type              {answers:[{id, answer}]} -> typed, validated, stored
    GET  /api/report/{id}       the report, filtered to what this report is entitled to
    POST /api/checkout          {report_id, tier} -> Stripe Checkout URL, or 501 if unconfigured
    POST /api/webhook/stripe    Stripe -> grants entitlement on checkout.session.completed
    POST /api/dev/grant         DEV ONLY (SOCION_DEV_MODE=1): grant a tier without payment

The master scoring prompt and the Anthropic key never leave this process:
the browser only ever receives the filtered report object.

Run locally:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...
    uvicorn server:app --port 8000
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal

import anthropic
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import payments
import scoring
import store

STATIC_DIR = Path(__file__).parent / "static"

DEV_MODE = os.environ.get("SOCION_DEV_MODE") == "1"
# QA-only: substitutes a fixture client for the real Anthropic client so the
# full pipeline (validation, storage, gating, rendering) can be exercised
# without an API key. Never set this in production — see testing/fake_client.py.
FAKE_CLIENT_MODE = os.environ.get("SOCION_FAKE_CLIENT")  # None | "1" | "malformed"

MAX_ANSWER_CHARS = 4000
RATE_LIMIT_WINDOW_S = 600
RATE_LIMIT_MAX = 6

app = FastAPI(title="Socion")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if not FAKE_CLIENT_MODE and not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
    print("WARNING: no ANTHROPIC_API_KEY set. /api/type will fail until credentials are configured.", flush=True)
if FAKE_CLIENT_MODE:
    print(f"WARNING: SOCION_FAKE_CLIENT={FAKE_CLIENT_MODE} — using a QA fixture instead of Claude. Not for production.", flush=True)
if DEV_MODE:
    print("WARNING: SOCION_DEV_MODE=1 — /api/dev/grant is enabled (grants paid tiers without payment).", flush=True)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # The frontend always parses error bodies as JSON; never fall through to
    # a plain-text 500 page.
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Your answers are saved — please try again."})


def get_client():
    if FAKE_CLIENT_MODE:
        from testing.fake_client import FakeAnthropicClient
        return FakeAnthropicClient(mode=FAKE_CLIENT_MODE)
    return anthropic.Anthropic()


def _model_label(result_model: str | None) -> str:
    return f"FAKE_CLIENT({FAKE_CLIENT_MODE})" if FAKE_CLIENT_MODE else (result_model or scoring.MODEL)


_rate_hits: dict[str, deque] = defaultdict(deque)


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    hits = _rate_hits[ip]
    while hits and now - hits[0] > RATE_LIMIT_WINDOW_S:
        hits.popleft()
    if len(hits) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many readings from this connection. Please wait a few minutes and try again.")
    hits.append(now)


# ---------------------------------------------------------------- pages

@app.get("/")
def homepage():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/test")
def test_page():
    return FileResponse(STATIC_DIR / "test.html")


@app.get("/result")
def result_page():
    return FileResponse(STATIC_DIR / "result.html")


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- api

@app.get("/api/questions")
def get_questions():
    return {
        "questions": [{"id": q["id"], "prompt": q["prompt"]} for q in scoring.QUESTIONS],
        "min_useful_chars": scoring.MIN_USEFUL_ANSWER_CHARS,
        "min_answered": scoring.MIN_ANSWERED_QUESTIONS,
    }


@app.get("/api/config")
def get_config():
    return {
        "payments_configured": not isinstance(payments.get_payment_adapter(), payments.NullPaymentAdapter),
        "dev_mode": DEV_MODE,
    }


class AnswerItem(BaseModel):
    id: str
    answer: str = Field(default="", max_length=MAX_ANSWER_CHARS)


class TypeRequest(BaseModel):
    answers: list[AnswerItem] = Field(..., max_length=len(scoring.QUESTIONS))


@app.post("/api/type")
def type_person(req: TypeRequest, request: Request):
    _check_rate_limit(request.client.host if request.client else "unknown")

    known_ids = {q["id"] for q in scoring.QUESTIONS}
    answers = {a.id: a.answer.strip() for a in req.answers if a.id in known_ids and a.answer.strip()}
    if len(answers) < scoring.MIN_ANSWERED_QUESTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Please answer at least {scoring.MIN_ANSWERED_QUESTIONS} of the {len(scoring.QUESTIONS)} questions. The reading depends on your own words.",
        )

    try:
        result = scoring.run_single_pass(answers, client=get_client())
    except scoring.SchemaValidationError:
        raise HTTPException(status_code=502, detail="The reading came back incomplete, so we didn't show it to you. Your answers are saved — please try again.")
    except anthropic.RateLimitError:
        raise HTTPException(status_code=503, detail="We're handling a lot of readings right now. Please try again in a minute.")
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"The typing engine returned an error ({e.status_code}). Please try again.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="Couldn't reach the typing engine. Please try again.")
    except TypeError as e:
        if "authentication" in str(e).lower():
            raise HTTPException(status_code=503, detail="The typing engine isn't configured on this server yet (missing API key).")
        raise

    report_id = store.create_report(answers, result)
    store.log_usage(
        report_id=report_id, tier="free", model=_model_label(result.get("model")),
        usage=result["usage"], cost_usd=scoring.estimate_cost_usd(result["usage"]),
    )
    return {"report_id": report_id, **scoring.filter_for_tier(result, "free")}


@app.get("/api/report/{report_id}")
def get_report(report_id: str):
    record = store.get_record(report_id)
    if record is None:
        raise HTTPException(status_code=404, detail="We couldn't find that reading. It may have expired.")
    tier = record.get("entitlement", "free")
    filtered = scoring.filter_for_tier({"report": record["report"]}, tier)
    return {
        "report_id": report_id,
        "created_at": record["created_at"],
        "verification_status": record.get("verification_status"),
        **filtered,
    }


class CheckoutRequest(BaseModel):
    report_id: str
    tier: Literal["paid", "verified"]


@app.post("/api/checkout")
def checkout(req: CheckoutRequest, request: Request):
    if store.get_record(req.report_id) is None:
        raise HTTPException(status_code=404, detail="Unknown reading.")
    adapter = payments.get_payment_adapter()
    base = str(request.base_url).rstrip("/")
    try:
        session = adapter.create_checkout_session(
            report_id=req.report_id, tier=req.tier,
            success_url=f"{base}/result?id={req.report_id}&checkout=success",
            cancel_url=f"{base}/result?id={req.report_id}&checkout=cancelled",
        )
    except payments.PaymentNotConfigured:
        raise HTTPException(status_code=501, detail="Payments aren't live yet. Your free reading is saved at this link.")
    return {"checkout_url": session.url}


def _run_verification(report_id: str) -> None:
    """Background task: subjects the reading the customer already saw to the
    Skeptic -> Synthesizer adversarial review."""
    record = store.get_record(report_id)
    if record is None:
        return
    store.update_fields(report_id, verification_status="running")
    try:
        result = scoring.run_verified_debate(record["answers"], client=get_client(), existing_report=record["report"])
    except Exception as e:  # noqa: BLE001 — any failure must leave a visible, non-silent status
        store.update_fields(report_id, verification_status="failed", verification_error=type(e).__name__)
        return
    store.update_report(report_id, result["report"])
    store.update_fields(report_id, verification_status="complete")
    store.log_usage(
        report_id=report_id, tier="verified", model=_model_label(result.get("model")),
        usage=result["usage"], cost_usd=scoring.estimate_cost_usd(result["usage"]),
    )


def _grant(report_id: str, tier: str, background: BackgroundTasks) -> None:
    store.grant_entitlement(report_id, tier)
    record = store.get_record(report_id)
    if tier == "verified" and record and record.get("verification_status") not in ("running", "complete"):
        store.update_fields(report_id, verification_status="queued")
        background.add_task(_run_verification, report_id)


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request, background: BackgroundTasks):
    adapter = payments.get_payment_adapter()
    payload = await request.body()
    try:
        extracted = adapter.verify_and_extract_report_id(payload, request.headers.get("stripe-signature"))
    except payments.PaymentNotConfigured:
        raise HTTPException(status_code=501, detail="Stripe is not configured.")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")
    if extracted:
        report_id, tier = extracted
        if tier in ("paid", "verified") and store.get_record(report_id):
            _grant(report_id, tier, background)
    return {"received": True}


class DevGrantRequest(BaseModel):
    report_id: str
    tier: Literal["paid", "verified"]


@app.post("/api/dev/grant")
def dev_grant(req: DevGrantRequest, background: BackgroundTasks):
    """DEV ONLY. Lets the tier-gating and verification flow be tested end to
    end without a Stripe account. Returns 404 unless SOCION_DEV_MODE=1, so it
    does not exist at all on a normally configured server."""
    if not DEV_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    if store.get_record(req.report_id) is None:
        raise HTTPException(status_code=404, detail="Unknown reading.")
    _grant(req.report_id, req.tier, background)
    return {"granted": req.tier}
