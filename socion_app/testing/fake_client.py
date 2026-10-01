"""
QA-ONLY stand-in for anthropic.Anthropic(). Never used unless the server is
started with SOCION_FAKE_CLIENT set.

It exists so the full pipeline — prompt construction, JSON extraction,
strict schema validation, storage, tier gating, and the result renderer —
can be exercised in an environment with no API key. It does NOT type
anyone: it returns one of two fixed fixture reports (LIE or ESI, chosen by
a hash of the answers so two different answer sets visibly exercise the
renderer with two different results), and copies evidence quotes verbatim
from the submitted answers so the evidence chain is tested against real
user text. Every report it produces is a fixture, and the server logs it
under model="FAKE_CLIENT(...)" so it can never be mistaken for real
API usage in the cost log.

Modes:
    "1"          valid fixture responses
    "malformed"  response text with no parseable JSON
    "invalid"    parseable JSON that violates the schema
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field

# Every request this fake receives, for test assertions.
RECEIVED: list[dict] = []

_FIXTURES = {
    "LIE": {
        "blocks": {
            "ego_block": {"base": "Te", "creative": "Ni"},
            "superego_block": {"role": "Fe", "vulnerable": "Si"},
            "superid_block": {"suggestive": "Fi", "mobilizing": "Se"},
            "id_block": {"ignoring": "Ti", "demonstrative": "Ne"},
        },
        "confidence": 68,
    },
    "ESI": {
        "blocks": {
            "ego_block": {"base": "Fi", "creative": "Se"},
            "superego_block": {"role": "Ti", "vulnerable": "Ne"},
            "superid_block": {"suggestive": "Te", "mobilizing": "Ni"},
            "id_block": {"ignoring": "Fe", "demonstrative": "Si"},
        },
        "confidence": 61,
    },
}

_BLOCK_QUALITY_FIELD = {
    "ego_block": "ego_quality",
    "superego_block": "superego_quality",
    "superid_block": "superid_quality",
    "id_block": "id_quality",
}


@dataclass
class _Block:
    text: str
    type: str = "text"


@dataclass
class _Usage:
    input_tokens: int = 412
    output_tokens: int = 1650
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 10800


@dataclass
class _Response:
    content: list
    usage: _Usage = field(default_factory=_Usage)


def _answers_from_prompt(prompt: str) -> list[str]:
    return [a.strip() for a in re.findall(r"\nA: (.*?)(?=\n\n|\nQ: |\n--- END)", prompt, re.DOTALL)]


def _snippet(text: str) -> str:
    first = re.split(r"(?<=[.!?])\s", text.strip())[0]
    return first[:180]


def _typist_report(prompt: str) -> dict:
    answers = _answers_from_prompt(prompt)
    digest = int(hashlib.sha256("\n".join(answers).encode()).hexdigest(), 16)
    code = "LIE" if digest % 2 == 0 else "ESI"
    fixture = _FIXTURES[code]

    elements = {}
    placement_of = {}
    for block_key, slots in fixture["blocks"].items():
        for slot, el in slots.items():
            placement_of[el] = block_key
    for i, (el, block_key) in enumerate(sorted(placement_of.items())):
        scores = {f: 8 for f in _BLOCK_QUALITY_FIELD.values()}
        scores[_BLOCK_QUALITY_FIELD[block_key]] = 74 - (i % 3) * 6
        quote = _snippet(answers[i % len(answers)]) if answers else ""
        elements[el] = {**scores, "evidence_quotes": [quote] if quote else [], "confidence": 55 + (i % 4) * 5}

    return {
        "elements": elements,
        "model_a_blocks": fixture["blocks"],
        "sociotype_placement": code,
        "overall_confidence": fixture["confidence"],
        "reasoning_summary": "[QA FIXTURE — not a real reading] Fixed fixture text used to test rendering; quotes above are copied from the submitted answers.",
    }


class _Messages:
    def __init__(self, mode: str):
        self.mode = mode

    def create(self, **kwargs):
        RECEIVED.append(kwargs)
        last_user = [m for m in kwargs["messages"] if m["role"] == "user"][-1]["content"]

        if "Skeptic stage" in last_user:
            return _Response([_Block("[QA FIXTURE] Skeptic: (a) no self-aggrandizing labels relied on; (b) one Ni quote reads as obligation; (c) blocks consistent; (d) Si evidence thin.")])
        if "Synthesizer stage" in last_user:
            delta = {"revisions": [
                {"element": "Ni", "original_block": "Creative", "challenge": "one quote reads as obligation, not ease",
                 "resolution": "uphold", "new_block": "unchanged", "confidence_delta": -5},
                {"element": "Si", "original_block": "Vulnerable", "challenge": "evidence is a single short line",
                 "resolution": "insufficient_evidence", "new_block": "unchanged — flagged low-confidence", "confidence_delta": -15},
            ]}
            return _Response([_Block("```json\n" + json.dumps(delta) + "\n```")])

        if self.mode == "malformed":
            return _Response([_Block("Here is my analysis of the subject: {'elements': not json at all")])
        report = _typist_report(last_user)
        if self.mode == "invalid":
            report["sociotype_placement"] = "SEI"  # contradicts the ego block -> must be rejected
        return _Response([_Block("```json\n" + json.dumps(report, ensure_ascii=False) + "\n```")])


class FakeAnthropicClient:
    def __init__(self, mode: str = "1"):
        self.messages = _Messages(mode)
