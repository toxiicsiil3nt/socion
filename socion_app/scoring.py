"""
scoring.py — the actual Socion typing pipeline.

All typing rules, guardrails, and the three-role debate format live in
master_scoring_prompt.md (repo root). This module just:
  1. loads it as a cached system prompt,
  2. runs either a single Typist pass (free / $40 tier) or the full
     Typist -> Skeptic -> Synthesizer Verification Debate Protocol ($100 tier),
  3. strictly validates the JSON schema defined in master_scoring_prompt.md §4
     before anything downstream ever sees it,
  4. merges the Synthesizer's revision-delta onto the Typist's original report,
  5. filters the result down to what each tier paid for.

The AI does the typing. Nothing in this file scores a personality from
keywords, rules, or a lookup table — every placement comes from a real
Claude API call against master_scoring_prompt.md. The only thing this file
computes locally is bookkeeping: token/cost accounting and tier-gating.

No business logic about pricing/payment lives here — server.py and
payments.py own that. This module only knows how to go from questionnaire
answers to a validated report dict.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

import anthropic

MODEL = "claude-sonnet-5"
MASTER_PROMPT_PATH = Path(__file__).parent.parent / "master_scoring_prompt.md"

# Sonnet 5 list pricing, per million tokens. Used only for logging estimated
# cost per request (measure_cost.py gets the exact numbers via count_tokens).
PRICE_INPUT = 2.00
PRICE_OUTPUT = 10.00
PRICE_CACHE_WRITE = 2.50
PRICE_CACHE_READ = 0.20

Tier = Literal["free", "paid", "verified"]

VALID_ELEMENT_CODES = {"Ti", "Te", "Fi", "Fe", "Si", "Se", "Ni", "Ne"}
# Each type's leading pair (Base, Creative) — Aušra's 1980 table. Used to
# reject a response whose stated type contradicts its own Ego block.
TYPE_LEADING_PAIRS = {
    "ILE": ("Ne", "Ti"), "SEI": ("Si", "Fe"), "ESE": ("Fe", "Si"), "LII": ("Ti", "Ne"),
    "SLE": ("Se", "Ti"), "IEI": ("Ni", "Fe"), "EIE": ("Fe", "Ni"), "LSI": ("Ti", "Se"),
    "SEE": ("Se", "Fi"), "ILI": ("Ni", "Te"), "LIE": ("Te", "Ni"), "ESI": ("Fi", "Se"),
    "LSE": ("Te", "Si"), "EII": ("Fi", "Ne"), "IEE": ("Ne", "Fi"), "SLI": ("Si", "Te"),
}
VALID_PLACEMENTS = set(TYPE_LEADING_PAIRS) | {"INDETERMINATE"}

# The open-ended questionnaire. These are deliberately NOT multiple-choice —
# the scoring method (master_scoring_prompt.md §2) reads linguistic register
# (normative vs. natural phrasing), which only shows up in free text. Order
# matters: the frontend presents these one at a time, in this sequence.
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
    {
        "id": "plan_change",
        "prompt": (
            "Tell me about a time your plans changed suddenly, with no "
            "warning. What actually went through your mind in the first few "
            "minutes — not what you think a reasonable person would feel."
        ),
    },
    {
        "id": "new_info",
        "prompt": (
            "Describe what actually happens for you when someone tells you "
            "something that contradicts what you already believed. Walk "
            "through the real sequence, not the polite version."
        ),
    },
]

MIN_USEFUL_ANSWER_CHARS = 20
MIN_ANSWERED_QUESTIONS = 5


class SchemaValidationError(ValueError):
    """Raised when a model response doesn't match master_scoring_prompt.md §4."""


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
        match = re.search(r"(\{.*\})", text, re.DOTALL)
    if not match:
        raise SchemaValidationError(f"No JSON object found in model response:\n{text[:500]}")
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as e:
        raise SchemaValidationError(f"Response contained malformed JSON: {e}") from e


def validate_report_schema(report: dict) -> None:
    """Strictly validate a Typist report against master_scoring_prompt.md §4.
    Raises SchemaValidationError with a specific reason on any mismatch.
    This is the gate that keeps a malformed or partial model response from
    ever reaching a customer."""
    if not isinstance(report, dict):
        raise SchemaValidationError("Report is not a JSON object.")

    elements = report.get("elements")
    if not isinstance(elements, dict):
        raise SchemaValidationError("Missing or invalid 'elements' object.")
    missing = VALID_ELEMENT_CODES - set(elements.keys())
    if missing:
        raise SchemaValidationError(f"'elements' is missing codes: {sorted(missing)}")
    for code, data in elements.items():
        if code not in VALID_ELEMENT_CODES:
            raise SchemaValidationError(f"Unknown element code: {code}")
        if not isinstance(data, dict):
            raise SchemaValidationError(f"Element {code} is not an object.")
        for field in ("ego_quality", "superego_quality", "superid_quality", "id_quality"):
            val = data.get(field)
            if val != "insufficient_evidence" and not isinstance(val, (int, float)):
                raise SchemaValidationError(f"Element {code}.{field} must be a number or 'insufficient_evidence', got {val!r}")
            if isinstance(val, (int, float)) and not (1 <= val <= 100):
                raise SchemaValidationError(f"Element {code}.{field}={val} out of range 1-100")
        if not isinstance(data.get("evidence_quotes"), list):
            raise SchemaValidationError(f"Element {code}.evidence_quotes must be a list.")

    blocks = report.get("model_a_blocks")
    if not isinstance(blocks, dict):
        raise SchemaValidationError("Missing or invalid 'model_a_blocks' object.")
    expected_blocks = {
        "ego_block": ("base", "creative"),
        "superego_block": ("role", "vulnerable"),
        "superid_block": ("suggestive", "mobilizing"),
        "id_block": ("ignoring", "demonstrative"),
    }
    seen_codes: list[str] = []
    for block_key, slots in expected_blocks.items():
        block = blocks.get(block_key)
        if not isinstance(block, dict):
            raise SchemaValidationError(f"Missing or invalid block '{block_key}'.")
        for slot in slots:
            code = block.get(slot)
            if code not in VALID_ELEMENT_CODES:
                raise SchemaValidationError(f"{block_key}.{slot} is not a valid element code: {code!r}")
            seen_codes.append(code)
    if len(set(seen_codes)) != 8:
        raise SchemaValidationError(f"model_a_blocks must use each of the 8 elements exactly once, got: {seen_codes}")

    placement = report.get("sociotype_placement")
    if placement not in VALID_PLACEMENTS:
        raise SchemaValidationError(f"Invalid sociotype_placement: {placement!r}")
    if placement != "INDETERMINATE":
        ego = blocks["ego_block"]
        if (ego["base"], ego["creative"]) != TYPE_LEADING_PAIRS[placement]:
            raise SchemaValidationError(
                f"sociotype_placement {placement} leads with {TYPE_LEADING_PAIRS[placement]}, "
                f"but ego_block is ({ego['base']}, {ego['creative']})"
            )

    confidence = report.get("overall_confidence")
    if not isinstance(confidence, (int, float)) or not (0 <= confidence <= 100):
        raise SchemaValidationError(f"overall_confidence must be a number 0-100, got {confidence!r}")

    if not isinstance(report.get("reasoning_summary"), str) or not report["reasoning_summary"].strip():
        raise SchemaValidationError("reasoning_summary must be a non-empty string.")


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


def estimate_cost_usd(usage: dict) -> float:
    return (
        usage["input_tokens"] / 1_000_000 * PRICE_INPUT
        + usage["output_tokens"] / 1_000_000 * PRICE_OUTPUT
        + usage["cache_creation_input_tokens"] / 1_000_000 * PRICE_CACHE_WRITE
        + usage["cache_read_input_tokens"] / 1_000_000 * PRICE_CACHE_READ
    )


def _request_typist(client: anthropic.Anthropic, system: list[dict], answers: dict[str, str]) -> tuple[dict, dict]:
    """One Typist call + validation. Retries once on a malformed/invalid
    response (a real, if infrequent, model failure mode) before giving up."""
    prompt = (
        "Analyze the questionnaire answers below per Sections 1-5 of the system "
        "prompt and output ONLY the final JSON object specified in Section 4 — "
        "a single ```json fenced code block, nothing else before or after it.\n\n"
        + _format_answers(answers)
    )
    last_error: Exception | None = None
    for attempt in range(2):
        response = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=system,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            messages=[{"role": "user", "content": prompt if attempt == 0 else prompt + "\n\nYour previous response could not be parsed as valid JSON matching the schema. Output ONLY the JSON object this time, in a single fenced block."}],
        )
        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            report = _extract_json_block(text)
            validate_report_schema(report)
            return report, _usage_dict(response.usage)
        except SchemaValidationError as e:
            last_error = e
            continue
    raise SchemaValidationError(f"Typist response failed validation after retry: {last_error}")


def run_single_pass(answers: dict[str, str], client: anthropic.Anthropic | None = None) -> dict:
    """One Typist call, validated. Computes the FULL Model A report in one
    shot (all four blocks) — the free/$40 tier distinction is purely a
    display-layer filter applied downstream, not a difference in what gets
    generated. See filter_for_tier()."""
    client = client or anthropic.Anthropic()
    system = _cached_system()
    report, usage = _request_typist(client, system, answers)
    return {"report": report, "usage": usage, "model": MODEL, "stages": None}


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
            merged["elements"][element]["revised_block"] = rev.get("new_block")
        confidence_delta = rev.get("confidence_delta")
        if isinstance(confidence_delta, (int, float)):
            current = merged["elements"][element].get("confidence", 0)
            if isinstance(current, (int, float)):
                merged["elements"][element]["confidence"] = max(0, min(100, current + confidence_delta))
        merged["elements"][element]["verification_note"] = {
            "challenge": rev.get("challenge"),
            "resolution": resolution,
            "new_block": rev.get("new_block"),
            "confidence_delta": confidence_delta if isinstance(confidence_delta, (int, float)) else None,
        }
    merged["verified"] = True
    return merged


def run_verified_debate(
    answers: dict[str, str],
    client: anthropic.Anthropic | None = None,
    existing_report: dict | None = None,
) -> dict:
    """Typist -> Skeptic -> Synthesizer protocol (socionics_debate.py's stage
    sequence). Used for the $100 tier, triggered only after purchase.

    When existing_report is given (the normal upgrade path), it stands in as
    the Typist stage: the Skeptic attacks the exact reading the customer
    already saw, rather than a fresh typing that could silently differ from
    it. That also saves one API call."""
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
    if existing_report is not None:
        validate_report_schema(existing_report)
        typist_report = existing_report
        typist_text = "```json\n" + json.dumps(existing_report, ensure_ascii=False) + "\n```"
        messages.append({"role": "user", "content": typist_prompt})
        messages.append({"role": "assistant", "content": typist_text})
    else:
        typist_text = call(typist_prompt, temperature=0.2)
        typist_report = _extract_json_block(typist_text)
        validate_report_schema(typist_report)

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
        "model": MODEL,
        "stages": {"typist": typist_text, "skeptic": skeptic_text, "synthesizer": synth_text},
    }


def build_evidence_chain(report: dict, element_code: str) -> dict | None:
    """The 'your answer -> linguistic pattern -> element -> Model A
    interpretation -> type' chain the result page shows. Built entirely
    from fields already in the validated JSON — never invents a quote."""
    el = report.get("elements", {}).get(element_code)
    if not el or not el.get("evidence_quotes"):
        return None
    quote = el["evidence_quotes"][0]
    ego_quality = el.get("ego_quality")
    is_natural = isinstance(ego_quality, (int, float)) and ego_quality >= 50
    return {
        "quote": quote,
        "pattern": "confident, self-generated phrasing" if is_natural else "borrowed, obligation-toned phrasing",
        "element": element_code,
        "placement": report.get("sociotype_placement"),
    }


FREE_VISIBLE_ELEMENTS_NOTE = (
    "This shows your two Ego-block channels only. The other six — where "
    "you feel obligation, what you crave from others, and what you use "
    "without noticing — are in the full report."
)


def filter_for_tier(result: dict, tier: Tier) -> dict:
    """Strip the report down to what the tier actually paid for. Runs
    server-side on every response so a client can never request its way
    into paid fields regardless of what it sends."""
    report = result["report"]
    if tier in ("paid", "verified"):
        payload = {
            "elements": report.get("elements"),
            "model_a_blocks": report.get("model_a_blocks"),
            "sociotype_placement": report.get("sociotype_placement"),
            "overall_confidence": report.get("overall_confidence"),
            "reasoning_summary": report.get("reasoning_summary"),
            "verified": report.get("verified", False),
        }
        ego = report.get("model_a_blocks", {}).get("ego_block", {})
        base_code = ego.get("base")
        if base_code:
            payload["evidence_chain"] = build_evidence_chain(report, base_code)
        return {"tier": tier, "report": payload}

    # free: Ego block + top type guess, WITH real evidence for just the two
    # Ego elements (the "wait, this is based on what I wrote" moment), but
    # nothing from the other three blocks.
    ego = report.get("model_a_blocks", {}).get("ego_block", {})
    base_code = ego.get("base")
    creative_code = ego.get("creative")
    elements = report.get("elements", {})
    visible_elements = {
        code: elements[code]
        for code in (base_code, creative_code)
        if code and code in elements
    }
    filtered = {
        "model_a_blocks": {"ego_block": ego},
        "elements": visible_elements,
        "sociotype_placement": report.get("sociotype_placement"),
        "overall_confidence": report.get("overall_confidence"),
        "evidence_chain": build_evidence_chain(report, base_code) if base_code else None,
        "locked_note": FREE_VISIBLE_ELEMENTS_NOTE,
    }
    return {"tier": "free", "report": filtered}
