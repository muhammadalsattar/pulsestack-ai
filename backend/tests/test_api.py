import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main as app_module  # noqa: E402


@pytest.fixture(autouse=True)
def reset_state() -> None:
    app_module.STATE.clear()
    app_module.STATE.update(app_module.create_seed_state())


client = TestClient(app_module.app)


def test_health_endpoint_envelope_and_request_id() -> None:
    resp = client.get("/health", headers={"X-Request-ID": "req_custom_123"})
    assert resp.status_code == 200
    assert resp.headers["X-Request-ID"] == "req_custom_123"
    body = resp.json()
    assert body["request_id"] == "req_custom_123"
    assert "timestamp" in body
    assert body["data"]["status"] == "ok"


def test_list_workspaces_returns_seeded_tenants() -> None:
    resp = client.get("/api/v1/workspaces")
    assert resp.status_code == 200
    data = resp.json()["data"]
    ids = {ws["id"] for ws in data["workspaces"]}
    assert ids == {"ws_acme", "ws_orbit", "ws_solo"}
    assert len(data["models"]) == 3
    assert len(data["plans"]) == 3


def test_streaming_chat_meters_tokens_and_updates_usage() -> None:
    before = client.get("/api/v1/workspaces/ws_acme/usage").json()["data"]["workspace"][
        "total_tokens"
    ]

    with client.stream(
        "POST",
        "/api/v1/workspaces/ws_acme/chat/stream",
        json={
            "prompt": "Design a Stripe webhook handler for plan upgrades",
            "model": "gpt-4o-mini",
            "temperature": 0.4,
        },
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        events = []
        for line in resp.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))

    event_types = [e["type"] for e in events]
    assert event_types[0] == "meta"
    assert "delta" in event_types
    assert event_types[-1] == "done"

    done = events[-1]
    assert done["total_tokens"] > 0
    assert done["cost_usd"] > 0

    after = client.get("/api/v1/workspaces/ws_acme/usage").json()["data"]["workspace"][
        "total_tokens"
    ]
    assert after == before + done["total_tokens"]


def test_quota_enforcement_returns_429_when_hard_limit_reached() -> None:
    ws = app_module.STATE["ws_solo"]
    ws["model_usage"]["gpt-4o-mini"]["tokens"] = 120_000  # exceeds 100k Free quota

    resp = client.post(
        "/api/v1/workspaces/ws_solo/chat/stream",
        json={"prompt": "Hello", "model": "gpt-4o-mini"},
    )
    assert resp.status_code == 429
    assert "quota" in resp.json()["detail"].lower()


def test_api_key_lifecycle_create_and_revoke() -> None:
    create_resp = client.post(
        "/api/v1/workspaces/ws_acme/api-keys",
        json={"name": "CI Automation Key", "scopes": ["chat:write", "usage:read"]},
    )
    assert create_resp.status_code == 201
    created = create_resp.json()["data"]
    assert created["secret_key"].startswith("ps_live_")
    key_id = created["api_key"]["id"]

    list_resp = client.get("/api/v1/workspaces/ws_acme/api-keys")
    assert any(k["id"] == key_id and k["status"] == "active" for k in list_resp.json()["data"]["api_keys"])

    revoke_resp = client.delete(f"/api/v1/workspaces/ws_acme/api-keys/{key_id}")
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["api_key"]["status"] == "revoked"


def test_billing_checkout_and_stripe_webhook_upgrade() -> None:
    checkout = client.post(
        "/api/v1/workspaces/ws_solo/billing/checkout",
        json={"target_plan": "pro", "simulate_immediate": False},
    )
    assert checkout.status_code == 200
    assert checkout.json()["data"]["mode"] == "demo"

    webhook = client.post(
        "/api/v1/webhooks/stripe",
        json={
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {
                        "workspace_id": "ws_solo",
                        "target_plan": "pro",
                    }
                }
            },
        },
    )
    assert webhook.status_code == 200
    updated_ws = webhook.json()["data"]["workspace"]
    assert updated_ws["plan"] == "pro"
    assert updated_ws["token_quota"] == 2_500_000
    assert webhook.json()["data"]["invoice"]["amount_usd"] == 49.0
