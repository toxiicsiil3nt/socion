"""
End-to-end pipeline tests: HTTP request -> prompt construction -> (fixture)
model response -> strict validation -> storage -> tier gating -> response.

The model call is the QA fixture client (no API key in CI), but everything
downstream of it is the real production code path.

    cd socion_app && python -m pytest tests -q
"""

import importlib
import os
import sys
from pathlib import Path

import pytest

APP_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_DIR))

ANSWERS_A = {
    "work_standards": "I rebuilt the schedule in a spreadsheet and showed the numbers. The old plan wasted two days a week, and once they saw the totals nobody argued.",
    "obligation": "I should check in with friends more. I know you're supposed to, and every time I forget I feel like a bad person for a day.",
    "attraction": "People who just walk into a room and own it. I find that magnetic because I have to think before I move.",
    "background_competence": "Fixing other people's budgets. I do it without being asked and never think of it as a skill.",
    "group_role": "I end up organizing who does what. Not because I want to lead, it just gets done faster.",
    "ideal_person": "Someone who notices when the house is a mess or when I'm tired, and just handles it without making it a thing.",
    "plan_change": "My first thought is what the new timeline looks like and what it costs us. Then I start rerouting.",
    "new_info": "I ask where the number came from. If the source is good I update immediately, no drama.",
}

ANSWERS_B = {
    "work_standards": "My manager said I was too soft with a client. I knew I was right because the client trusted us afterward and stayed for three more years.",
    "obligation": "Being more organized with paperwork. Every bill feels like a small test I keep failing.",
    "attraction": "Calm, strategic people who can see years ahead. Around them I feel like someone is steering.",
    "background_competence": "Knowing who in a group is upset before they say anything, and who can't be trusted.",
    "group_role": "I'm loyal to a few people and I'll defend them hard. I don't care much about the rest of the room.",
    "ideal_person": "Someone who handles the money and the long-term plans so I don't have to think about them.",
    "plan_change": "I react right away and get physically moving to fix it, then feel annoyed later.",
    "new_info": "If it comes from someone I trust, I take it seriously. If not, I mostly ignore it.",
}


def _load_app(monkeypatch, tmp_path, fake_mode="1", dev_mode=True):
    monkeypatch.setenv("SOCION_FAKE_CLIENT", fake_mode)
    if dev_mode:
        monkeypatch.setenv("SOCION_DEV_MODE", "1")
    else:
        monkeypatch.delenv("SOCION_DEV_MODE", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    import store
    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "REPORTS_PATH", tmp_path / "reports.json")
    monkeypatch.setattr(store, "USAGE_LOG_PATH", tmp_path / "usage_log.jsonl")
    import server
    server = importlib.reload(server)
    from fastapi.testclient import TestClient
    from testing import fake_client
    fake_client.RECEIVED.clear()
    return TestClient(server.app), fake_client


def _payload(answers):
    return {"answers": [{"id": k, "answer": v} for k, v in answers.items()]}


def test_answers_reach_model_and_valid_report_returned(monkeypatch, tmp_path):
    client, fake = _load_app(monkeypatch, tmp_path)
    r = client.post("/api/type", json=_payload(ANSWERS_A))
    assert r.status_code == 200, r.text
    body = r.json()

    # the user's actual words were in the request sent to the model
    sent = fake.RECEIVED[0]["messages"][0]["content"]
    for answer in ANSWERS_A.values():
        assert answer in sent
    # the master prompt went as the cached system prompt, never to the client
    assert fake.RECEIVED[0]["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "Master Scoring Prompt" in fake.RECEIVED[0]["system"][0]["text"]
    assert "Master Scoring Prompt" not in r.text

    assert body["tier"] == "free"
    assert body["report"]["sociotype_placement"] in ("LIE", "ESI")


def test_free_tier_never_exposes_paid_fields(monkeypatch, tmp_path):
    client, _ = _load_app(monkeypatch, tmp_path)
    body = client.post("/api/type", json=_payload(ANSWERS_A)).json()
    report = body["report"]
    assert set(report["model_a_blocks"]) == {"ego_block"}
    assert "reasoning_summary" not in report
    ego = report["model_a_blocks"]["ego_block"]
    assert set(report["elements"]) == {ego["base"], ego["creative"]}
    # same guarantee on the GET path
    again = client.get(f"/api/report/{body['report_id']}").json()["report"]
    assert set(again["model_a_blocks"]) == {"ego_block"}
    assert len(again["elements"]) == 2


def test_evidence_chain_quotes_user_text(monkeypatch, tmp_path):
    client, _ = _load_app(monkeypatch, tmp_path)
    chain = client.post("/api/type", json=_payload(ANSWERS_A)).json()["report"]["evidence_chain"]
    assert chain is not None
    assert any(chain["quote"] in a for a in ANSWERS_A.values())


def test_two_answer_sets_render_their_own_results(monkeypatch, tmp_path):
    client, _ = _load_app(monkeypatch, tmp_path)
    a = client.post("/api/type", json=_payload(ANSWERS_A)).json()
    b = client.post("/api/type", json=_payload(ANSWERS_B)).json()
    assert a["report_id"] != b["report_id"]
    qa = a["report"]["evidence_chain"]["quote"]
    qb = b["report"]["evidence_chain"]["quote"]
    assert any(qa in x for x in ANSWERS_A.values())
    assert any(qb in x for x in ANSWERS_B.values())


@pytest.mark.parametrize("mode", ["malformed", "invalid"])
def test_bad_model_output_fails_safely(monkeypatch, tmp_path, mode):
    client, fake = _load_app(monkeypatch, tmp_path, fake_mode=mode)
    r = client.post("/api/type", json=_payload(ANSWERS_A))
    assert r.status_code == 502
    assert "detail" in r.json()
    assert len(fake.RECEIVED) == 2  # original + one retry, then refused
    # nothing partial was stored
    assert not (tmp_path / "reports.json").exists() or (tmp_path / "reports.json").read_text() == "{}"


def test_too_few_answers_rejected(monkeypatch, tmp_path):
    client, fake = _load_app(monkeypatch, tmp_path)
    few = dict(list(ANSWERS_A.items())[:3])
    r = client.post("/api/type", json=_payload(few))
    assert r.status_code == 400
    assert fake.RECEIVED == []  # never spent an API call


def test_checkout_without_stripe_is_honest(monkeypatch, tmp_path):
    client, _ = _load_app(monkeypatch, tmp_path)
    rid = client.post("/api/type", json=_payload(ANSWERS_A)).json()["report_id"]
    r = client.post("/api/checkout", json={"report_id": rid, "tier": "paid"})
    assert r.status_code == 501
    assert client.get(f"/api/report/{rid}").json()["tier"] == "free"


def test_dev_grant_disabled_without_dev_mode(monkeypatch, tmp_path):
    client, _ = _load_app(monkeypatch, tmp_path, dev_mode=False)
    rid = client.post("/api/type", json=_payload(ANSWERS_A)).json()["report_id"]
    r = client.post("/api/dev/grant", json={"report_id": rid, "tier": "paid"})
    assert r.status_code == 404
    assert client.get(f"/api/report/{rid}").json()["tier"] == "free"


def test_paid_then_verified_upgrade(monkeypatch, tmp_path):
    client, fake = _load_app(monkeypatch, tmp_path)
    rid = client.post("/api/type", json=_payload(ANSWERS_A)).json()["report_id"]

    client.post("/api/dev/grant", json={"report_id": rid, "tier": "paid"})
    paid = client.get(f"/api/report/{rid}").json()
    assert paid["tier"] == "paid"
    assert set(paid["report"]["model_a_blocks"]) == {"ego_block", "superego_block", "superid_block", "id_block"}
    assert len(paid["report"]["elements"]) == 8
    assert fake.RECEIVED.__len__() == 1  # $40 unlocked existing data, no new API call

    client.post("/api/dev/grant", json={"report_id": rid, "tier": "verified"})
    verified = client.get(f"/api/report/{rid}").json()
    assert verified["tier"] == "verified"
    assert verified["verification_status"] == "complete"
    assert verified["report"]["verified"] is True
    # reviewed the SAME placement the customer saw; Skeptic + Synthesizer only
    assert verified["report"]["sociotype_placement"] == paid["report"]["sociotype_placement"]
    assert len(fake.RECEIVED) == 3
    notes = [e.get("verification_note") for e in verified["report"]["elements"].values() if e.get("verification_note")]
    assert notes


def test_usage_logged_per_generation(monkeypatch, tmp_path):
    import json
    client, _ = _load_app(monkeypatch, tmp_path)
    rid = client.post("/api/type", json=_payload(ANSWERS_A)).json()["report_id"]
    client.post("/api/dev/grant", json={"report_id": rid, "tier": "verified"})
    lines = [json.loads(l) for l in (tmp_path / "usage_log.jsonl").read_text().splitlines()]
    assert [l["tier"] for l in lines] == ["free", "verified"]
    for l in lines:
        for key in ("timestamp", "model", "input_tokens", "cache_read_input_tokens", "output_tokens", "estimated_cost_usd"):
            assert key in l
        assert l["model"].startswith("FAKE_CLIENT")  # fixture runs never pollute real cost data


def test_unknown_report_404(monkeypatch, tmp_path):
    client, _ = _load_app(monkeypatch, tmp_path)
    assert client.get("/api/report/doesnotexist").status_code == 404
