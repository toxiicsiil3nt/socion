"""
scoring.py — the actual Socion typing pipeline.

All typing rules, guardrails, and the three-role debate format live in
master_scoring_prompt.md (repo root). This module just:
  1. loads it as a cached system prompt,
  2. runs either a single Typist pass (free / $40 tier) or the full
     Typist -> Skeptic -> Synthesizer Verification Debate Protocol ($100 tier),
  3. extracts/merges the JSON schema defined in master_scoring_prompt.md §4,
  4. filters the result down for the tier that was actually paid for.

No business logic about pricing/payment lives here — server.py owns that.
This module only knows how to go from questionnaire answers to a report dict.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

import anthropic

MODEL = "claude-sonnet-5"
MASTER_PROMPT_PATH = Path(__file__).parent.parent / "master_scoring_prompt.md"

Tier = Literal["free", "paid", "verified"]

# The open-ended questionnaire. These are deliberately NOT multiple-choice —
# the scoring method (master_scoring_prompt.md §2) reads linguistic register
# (normative vs. natural phrasing), which only shows up in free text.
QUESTIONS: list[dict[str, str]] = [
    {
        "id": "work_standards",
        "prompt": (
            "Tell me about a time someone disagreed with how you did something "
            "at work or school. How did you know you were right (or realize "
            "you weren't)?"
        ),
    },
    {
        "id": "obligation",
        "prompt": (
            "What's something you keep telling yourself you *should* do more "
            "of, but it never quite sticks? What does it feel like when you "
            "fall short of it?"
        ),
    },
    {
        "id": "attraction",
        "prompt": (
            "Think of a quality in other people that you find genuinely "
            "magnetic or admirable — something you don't have much of "
            "yourself. What is it, and what's it like to be around someone "
            "who has it?"
        ),
    },
    {
        "id": "background_competence",
        "prompt": (
            "What's something you're quietly good at that you never think "
            "about or get credit for — the kind of thing you'd do for someone "
            "else without being asked?"
        ),
    },
    {
        "id": "group_role",
        "prompt": (
            "Describe what you're actually like in a group of friends or "
            "coworkers — not what role you wish you played, what you notice "
            "yourself doing without planning to."
        ),
    },
    {
        "id": "ideal_person",
        "prompt": (
            "Describe your ideal partner or closest friend — not their looks "
            "or interests, but what they're like to deal with day to day, and "
            "what they'd handle so you don't have to."
        ),
    },
]


def load_master_prompt() -> str:
    if not MASTER_PROMPT_PATH.exists():
        raise FileNotFoundError(f"master_scoring_prompt.md not found at {MASTER_PROMPT_PATH}")
    return MASTER_PROMPT_PATH.read_text(encoding="utf-8")


def _cached_system() -> list[dict]:
    return [
        {
            "type": "text",
            "text": load_master_prompt(),
            "cache_control": {"type": "ephemeral"},
        }
    ]


def _format_answers(answers: dict[str, str]) -> str:
    lines = ["--- QUESTIONNAIRE ANSWERS ---"]
    for q in QUESTIONS:
        answer = answers.get(q["id"], "").strip()
        if answer:
            lines.append(f"Q: {q['prompt']}\nA: {answer}\n")
    lines.append("--- END QUESTIONNAIRE ANSWERS ---")
    return "\n".join(lines)


def _extract_json_block(text: str) -> dict:
    """Pull the first ```json ... ``` fenced block out of a model response."""
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not match:
        # fall back: maybe the whole response is bare JSON
        match = re.search(r"(\{.*\})", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in model response:\n{text[:500]}")
    return json.loads(match.group(1))


def _usage_dict(usage) -> dict:
    return {
        "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "input_tokens": getattr(usage, "input_tokens", 0) or 0,
        "output_tokens": getattr(usage, "output_tokens", 0) or 0,
    }


def _sum_usage(usages: list[dict]) -> dict:
    out = {"cache_read_input_tokens": 0, "cache_creation_input_tokens": 0, "input_tokens": 0, "output_tokens": 0}
    for u in usages:
        for k in out:
            out[k] += u[k]
    return out


def run_single_pass(answers: dict[str, str], client: anthropic.Anthropic | None = None) -> dict:
    """One Typist call. Used for the free and $40 tiers."""
    client = client or anthropic.Anthropic()
    system = _cached_system()
    prompt = (
        "Analyze the questionnaire answers below per Sections 1-5 of the system "
        "prompt and output ONLY the final JSON object specified in Section 4 — "
        "a single ```json fenced code block, nothing else before or after it.\n\n"
        + _format_answers(answers)
    )
    response = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=system,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        messages=[{"role": "user", "content": prompt}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    report = _extract_json_block(text)
    return {"report": report, "usage": _usage_dict(response.usage), "stages": None}


def _apply_revision_delta(report: dict, delta: dict) -> dict:
    """Merge the Synthesizer's revision-delta (master_scoring_prompt.md §6) onto
    the Typist's original report. Deterministic, no extra API call needed."""
    merged = json.loads(json.dumps(report))  # deep copy
    for rev in delta.get("revisions", []):
        element = rev.get("element")
        resolution = rev.get("resolution")
        if element not in merged.get("elements", {}):
            continue
        if resolution == "revise":
            # new_block tells us which block this element should move to;
            # the actual quality-score rebalancing is left to the confidence
            # delta since the Synthesizer doesn't re-score from scratch.
            merged["elements"][element]["revised_block"] = rev.get("new_block")
        confidence_delta = rev.get("confidence_delta")
        if isinstance(confidence_delta, (int, float)):
            current = merged["elements"][element].get("confidence", 0)
            if isinstance(current, (int, float)):
                merged["elements"][element]["confidence"] = max(0, min(100, current + confidence_delta))
        merged["elements"][element]["verification_note"] = {
            "challenge": rev.get("challenge"),
            "resolution": resolution,
        }
    merged["verified"] = True
    return merged


def run_verified_debate(answers: dict[str, str], client: anthropic.Anthropic | None = None) -> dict:
    """Full Typist -> Skeptic -> Synthesizer protocol. Used for the $100 tier.
    Mirrors socionics_debate.py's stage sequence but returns a structured
    report dict instead of printing transcript text."""
    client = client or anthropic.Anthropic()
    system = _cached_system()
    messages: list[dict] = []
    usages: list[dict] = []

    def call(user_text: str, temperature: float) -> str:
        messages.append({"role": "user", "content": user_text})
        response = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=system,
            temperature=temperature,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            messages=messages,
        )
        text = next((b.text for b in response.content if b.type == "text"), "")
        messages.append({"role": "assistant", "content": text})
        usages.append(_usage_dict(response.usage))
        return text

    typist_prompt = (
        "Run the Verification Debate Protocol (Section 6) on the questionnaire "
        "answers below. Produce ONLY the Typist stage: output the final JSON "
        "object from Section 4 in a single ```json fenced code block, nothing "
        "else before or after it.\n\n" + _format_answers(answers)
    )
    typist_text = call(typist_prompt, temperature=0.2)
    typist_report = _extract_json_block(typist_text)

    skeptic_prompt = (
        "Now produce ONLY the Skeptic stage. Do not re-type. Attack the "
        "Typist's output above, addressing all four required checks from "
        "Section 6 explicitly: (a) self-aggrandizing bias, (b) register "
        "confusion, (c) Model A structural violation, (d) evidence "
        "cherry-picking."
    )
    skeptic_text = call(skeptic_prompt, temperature=1.0)

    synthesizer_prompt = (
        "Now produce ONLY the Synthesizer stage. Resolve each Skeptic point "
        "individually (uphold / revise / insufficient_evidence) and output "
        "the revision-delta JSON specified in Section 6 as a single ```json "
        "fenced code block — not a fresh JSON block from scratch."
    )
    synth_text = call(synthesizer_prompt, temperature=0.2)
    delta = _extract_json_block(synth_text)

    final_report = _apply_revision_delta(typist_report, delta)

    return {
        "report": final_report,
        "usage": _sum_usage(usages),
        "stages": {"typist": typist_text, "skeptic": skeptic_text, "synthesizer": synth_text},
    }


FREE_TIER_ALLOWED_KEYS = {"model_a_blocks", "sociotype_placement", "overall_confidence"}


def filter_for_tier(result: dict, tier: Tier) -> dict:
    """Strip the report down to what the tier actually paid for. Runs
    server-side after generation so the free tier never gets the full JSON
    over the wire, regardless of what the model returned."""
    report = result["report"]
    if tier in ("paid", "verified"):
        return result

    # free: Ego block + top type guess only, no element-level evidence,
    # no other blocks. This is the "try before you buy" sample.
    ego = report.get("model_a_blocks", {}).get("ego_block", {})
    filtered = {
        "model_a_blocks": {"ego_block": ego},
        "sociotype_placement": report.get("sociotype_placement"),
        "overall_confidence": report.get("overall_confidence"),
        "upsell": (
            "This is your Ego block only. The full report (all four Model A "
            "blocks, element-level evidence, and reasoning) is available on "
            "the $40 and $100 tiers."
        ),
    }
    return {"report": filtered, "usage": result["usage"], "stages": None}
