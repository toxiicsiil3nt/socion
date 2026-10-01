"""
server.py — minimal backend for Socion.

    POST /api/type   {"answers": {<question_id>: <text>, ...}, "tier": "free"|"paid"|"verified"}
                     -> {"report": {...}, "usage": {...}}

"free"   -> one Typist pass, response filtered to Ego block + top type guess.
"paid"   -> one Typist pass, full Model A report ($40 tier).
"verified" -> full Typist -> Skeptic -> Synthesizer debate ($100 tier).

Run locally:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-ant-...
    uvicorn server:app --reload --port 8000
    open http://localhost:8000/
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import os

import anthropic
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import scoring

app = FastAPI(title="Socion API")

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if not os.environ.get("ANTHROPIC_API_KEY") and not os.environ.get("ANTHROPIC_AUTH_TOKEN"):
    print(
        "WARNING: no ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN set. "
        "/api/type will fail until credentials are configured.",
        flush=True,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # The frontend always does r.json() on an error response — never let an
    # uncaught exception (e.g. missing ANTHROPIC_API_KEY, which the SDK
    # raises as a bare TypeError, not an anthropic.* exception) fall through
    # to FastAPI's default plain-text 500 page and break that parse.
    return JSONResponse(status_code=500, content={"detail": f"Server error: {exc}"})


class TypeRequest(BaseModel):
    answers: dict[str, str] = Field(..., description="question_id -> free-text answer")
    tier: Literal["free", "paid", "verified"] = "free"


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "quiz.html")


@app.get("/api/questions")
def get_questions():
    return {"questions": scoring.QUESTIONS}


@app.post("/api/type")
def type_person(req: TypeRequest):
    answered = {k: v for k, v in req.answers.items() if v and v.strip()}
    if len(answered) < 3:
        raise HTTPException(status_code=400, detail="Please answer at least 3 questions — short, vague answers produce an unreliable report.")

    client = anthropic.Anthropic()  # resolves ANTHROPIC_API_KEY from the environment

    try:
        if req.tier == "verified":
            result = scoring.run_verified_debate(answered, client=client)
        else:
            result = scoring.run_single_pass(answered, client=client)
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"Typing engine error: {e.message}") from e
    except ValueError as e:
        # model didn't return parseable JSON — surface as a retryable error,
        # never show the customer a broken/partial report
        raise HTTPException(status_code=502, detail="The typing engine returned an unreadable report. Please try again.") from e

    filtered = scoring.filter_for_tier(result, req.tier)
    return filtered


@app.get("/health")
def health():
    return {"status": "ok"}
