"""
payments.py — server-side payment adapter for the $40 / $100 tiers.

No payment provider secret ever reaches the client: this module is the only
place STRIPE_SECRET_KEY is read, and checkout/webhook routes in server.py
call into it rather than touching Stripe directly.

If STRIPE_SECRET_KEY isn't set, get_payment_adapter() returns
NullPaymentAdapter, which fails loudly and explicitly (PaymentNotConfigured)
instead of pretending a checkout happened. There is no fake "payment
succeeded" path in this file — server.py's dev-only entitlement-grant route
(gated behind SOCION_DEV_MODE, see server.py) is the only way to test the
tier-gating logic without a real Stripe account, and it is clearly separate
from this module.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Tier prices in cents, matching the homepage's $0 / $40 / $100 pricing.
TIER_PRICES_CENTS = {"paid": 4000, "verified": 10000}
TIER_LABELS = {"paid": "Socion Full Report", "verified": "Socion Verified Report"}


class PaymentNotConfigured(RuntimeError):
    """Raised by NullPaymentAdapter — there is no Stripe key set, so
    checkout cannot actually run. This is the honest failure mode, not a
    bug to work around."""


@dataclass
class CheckoutSession:
    url: str
    session_id: str


class PaymentAdapter:
    def create_checkout_session(self, report_id: str, tier: str, success_url: str, cancel_url: str) -> CheckoutSession:
        raise NotImplementedError

    def verify_and_extract_report_id(self, payload: bytes, sig_header: str | None) -> tuple[str, str] | None:
        """Verify a webhook payload and return (report_id, tier) on a
        completed checkout, or None if the event isn't a completed payment."""
        raise NotImplementedError


class NullPaymentAdapter(PaymentAdapter):
    """Used whenever STRIPE_SECRET_KEY is unset. Every call fails with a
    clear, specific TODO rather than faking success."""

    def create_checkout_session(self, report_id: str, tier: str, success_url: str, cancel_url: str) -> CheckoutSession:
        raise PaymentNotConfigured(
            "Stripe is not configured (STRIPE_SECRET_KEY is unset). "
            "TODO: set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then "
            "StripePaymentAdapter below will handle real checkout. Until "
            "then, /api/checkout correctly reports payments as unavailable "
            "rather than pretending to charge the customer."
        )

    def verify_and_extract_report_id(self, payload: bytes, sig_header: str | None) -> tuple[str, str] | None:
        raise PaymentNotConfigured("Stripe is not configured; no webhook to verify.")


class StripePaymentAdapter(PaymentAdapter):
    """Real Stripe Checkout integration. Only instantiated when
    STRIPE_SECRET_KEY is set — see get_payment_adapter(). Requires the
    `stripe` package (not in requirements.txt by default since most dev
    environments won't have a Stripe account yet; add it when you wire
    this up: `pip install stripe`)."""

    def __init__(self, secret_key: str, webhook_secret: str | None):
        import stripe  # local import: only required once Stripe is actually configured

        self._stripe = stripe
        self._stripe.api_key = secret_key
        self._webhook_secret = webhook_secret

    def create_checkout_session(self, report_id: str, tier: str, success_url: str, cancel_url: str) -> CheckoutSession:
        session = self._stripe.checkout.Session.create(
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "unit_amount": TIER_PRICES_CENTS[tier],
                    "product_data": {"name": TIER_LABELS[tier]},
                },
                "quantity": 1,
            }],
            metadata={"report_id": report_id, "tier": tier},
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return CheckoutSession(url=session.url, session_id=session.id)

    def verify_and_extract_report_id(self, payload: bytes, sig_header: str | None):
        event = self._stripe.Webhook.construct_event(payload, sig_header, self._webhook_secret)
        if event["type"] != "checkout.session.completed":
            return None
        metadata = event["data"]["object"].get("metadata", {})
        report_id = metadata.get("report_id")
        tier = metadata.get("tier")
        if not report_id or not tier:
            return None
        return report_id, tier


def get_payment_adapter() -> PaymentAdapter:
    secret_key = os.environ.get("STRIPE_SECRET_KEY")
    if not secret_key:
        return NullPaymentAdapter()
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    return StripePaymentAdapter(secret_key, webhook_secret)
