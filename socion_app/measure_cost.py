#!/usr/bin/env python3
"""
measure_cost.py — priority #2: exact token-count & cost measurement for the
free / $40 / $100 tiers, using the real count_tokens endpoint instead of
estimating from byte size.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python3 measure_cost.py

Prints the exact cached-system-prompt token count, a realistic per-tier
request shape, and the resulting cost using current Sonnet 5 pricing
($2/$10 per MTok; cache write ~1.25x input, cache read ~0.1x input —
confirm the cache-read multiplier against your actual usage.cache_read
billing once you have real traffic, these are list-price approximations).
"""

import sys

import anthropic

import scoring

# Sonnet 5 pricing, per million tokens (update if you change MODEL in scoring.py)
PRICE_INPUT = 2.00
PRICE_OUTPUT = 10.00
PRICE_CACHE_WRITE = 2.50   # ~1.25x input
PRICE_CACHE_READ = 0.20    # ~0.1x input

SAMPLE_ANSWERS = {q["id"]: "A realistic paragraph-length answer, several sentences, written naturally." for q in scoring.QUESTIONS}


def cost(usage: dict) -> float:
    return (
        usage["input_tokens"] / 1_000_000 * PRICE_INPUT
        + usage["output_tokens"] / 1_000_000 * PRICE_OUTPUT
        + usage["cache_creation_input_tokens"] / 1_000_000 * PRICE_CACHE_WRITE
        + usage["cache_read_input_tokens"] / 1_000_000 * PRICE_CACHE_READ
    )


def main():
    client = anthropic.Anthropic()

    system_prompt_text = scoring.load_master_prompt()
    count = client.messages.count_tokens(
        model=scoring.MODEL,
        system=system_prompt_text,
        messages=[{"role": "user", "content": "x"}],
    )
    print(f"master_scoring_prompt.md exact token count: {count.input_tokens}\n", file=sys.stderr)

    print("--- Single-pass report (free / $40 tier) ---", file=sys.stderr)
    single = scoring.run_single_pass(SAMPLE_ANSWERS, client=client)
    print(single["usage"], file=sys.stderr)
    print(f"Cost: ${cost(single['usage']):.4f}\n", file=sys.stderr)

    print("--- Verified Debate Protocol (cold cache) ($100 tier) ---", file=sys.stderr)
    verified = scoring.run_verified_debate(SAMPLE_ANSWERS, client=client)
    print(verified["usage"], file=sys.stderr)
    print(f"Cost: ${cost(verified['usage']):.4f}", file=sys.stderr)


if __name__ == "__main__":
    main()
