from __future__ import annotations

import asyncio
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Literal

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

APP_VERSION = "1.0.0"

PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_monthly_usd": 0,
        "token_quota": 100_000,
        "max_api_keys": 2,
        "rpm_limit": 20,
        "features": [
            "100K monthly tokens",
            "Up to 2 scoped API keys",
            "14-day usage analytics",
            "Community support",
        ],
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_monthly_usd": 49,
        "token_quota": 2_500_000,
        "max_api_keys": 15,
        "rpm_limit": 120,
        "features": [
            "2.5M monthly tokens",
            "Up to 15 scoped API keys",
            "Real-time cost metering & alerts",
            "Priority SSE gateway routing",
        ],
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "price_monthly_usd": 249,
        "token_quota": 15_000_000,
        "max_api_keys": 100,
        "rpm_limit": 600,
        "features": [
            "15M monthly tokens",
            "Unlimited team workspaces & RBAC",
            "Dedicated rate limits & SLA",
            "Custom model endpoints & audit logs",
        ],
    },
}

MODELS: dict[str, dict[str, Any]] = {
    "gpt-4o-mini": {
        "id": "gpt-4o-mini",
        "provider": "OpenAI",
        "input_per_1m_usd": 0.15,
        "output_per_1m_usd": 0.60,
        "context_window": 128_000,
    },
    "claude-3.5-sonnet": {
        "id": "claude-3.5-sonnet",
        "provider": "Anthropic",
        "input_per_1m_usd": 3.00,
        "output_per_1m_usd": 15.00,
        "context_window": 200_000,
    },
    "llama-3.1-70b-local": {
        "id": "llama-3.1-70b-local",
        "provider": "Self-Hosted vLLM",
        "input_per_1m_usd": 0.08,
        "output_per_1m_usd": 0.24,
        "context_window": 131_072,
    },
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def estimate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = MODELS.get(model_id, MODELS["gpt-4o-mini"])
    cost = (prompt_tokens / 1_000_000) * pricing["input_per_1m_usd"] + (
        completion_tokens / 1_000_000
    ) * pricing["output_per_1m_usd"]
    return round(cost, 6)


def envelope(request: Request, data: Any) -> dict[str, Any]:
    request_id = getattr(request.state, "request_id", f"req_{secrets.token_hex(6)}")
    return {
        "request_id": request_id,
        "timestamp": utc_now_iso(),
        "data": data,
    }


def _generate_daily_history(
    total_tokens_target: int,
    avg_cost_per_1k: float,
    seed_offset: int,
) -> list[dict[str, Any]]:
    today = datetime.now(timezone.utc).date()
    weights = [0.72, 0.85, 0.64, 0.91, 1.08, 0.95, 0.78, 1.12, 1.24, 1.05, 0.88, 1.18, 1.31, 1.09]
    rotated = weights[seed_offset % len(weights) :] + weights[: seed_offset % len(weights)]
    weight_sum = sum(rotated)
    history: list[dict[str, Any]] = []
    for idx in range(14):
        day = today - timedelta(days=13 - idx)
        tokens = int(total_tokens_target * (rotated[idx] / weight_sum))
        requests_count = max(4, tokens // 1850)
        cost_usd = round((tokens / 1000.0) * avg_cost_per_1k, 4)
        history.append(
            {
                "date": day.isoformat(),
                "tokens": tokens,
                "cost_usd": cost_usd,
                "requests": requests_count,
            }
        )
    return history


def create_seed_state() -> dict[str, dict[str, Any]]:
    now = datetime.now(timezone.utc)

    acme_daily = _generate_daily_history(1_710_000, 0.00145, 0)
    orbit_daily = _generate_daily_history(6_180_000, 0.0029, 3)
    solo_daily = _generate_daily_history(86_400, 0.00055, 7)

    return {
        "ws_acme": {
            "id": "ws_acme",
            "name": "Acme Labs",
            "slug": "acme-labs",
            "plan": "pro",
            "members_count": 8,
            "region": "us-east-1",
            "created_at": (now - timedelta(days=94)).isoformat(),
            "daily_usage": acme_daily,
            "model_usage": {
                "gpt-4o-mini": {"tokens": 985_000, "cost_usd": 0.412, "requests": 562},
                "claude-3.5-sonnet": {"tokens": 415_000, "cost_usd": 3.845, "requests": 198},
                "llama-3.1-70b-local": {"tokens": 310_000, "cost_usd": 0.056, "requests": 164},
            },
            "recent_requests": [
                {
                    "request_id": "req_9a81f2c301ab",
                    "timestamp": (now - timedelta(minutes=6)).isoformat(),
                    "model": "claude-3.5-sonnet",
                    "prompt_tokens": 482,
                    "completion_tokens": 319,
                    "total_tokens": 801,
                    "cost_usd": 0.006231,
                    "latency_ms": 842,
                    "status": 200,
                },
                {
                    "request_id": "req_7c14e9d842fe",
                    "timestamp": (now - timedelta(minutes=21)).isoformat(),
                    "model": "gpt-4o-mini",
                    "prompt_tokens": 310,
                    "completion_tokens": 244,
                    "total_tokens": 554,
                    "cost_usd": 0.000193,
                    "latency_ms": 418,
                    "status": 200,
                },
                {
                    "request_id": "req_4b09d1a773cd",
                    "timestamp": (now - timedelta(minutes=54)).isoformat(),
                    "model": "llama-3.1-70b-local",
                    "prompt_tokens": 620,
                    "completion_tokens": 412,
                    "total_tokens": 1032,
                    "cost_usd": 0.000148,
                    "latency_ms": 612,
                    "status": 200,
                },
            ],
            "api_keys": [
                {
                    "id": "key_acme_prod_01",
                    "name": "Production Gateway",
                    "prefix": "ps_live_9f2a...c841",
                    "scopes": ["chat:write", "usage:read"],
                    "status": "active",
                    "created_at": (now - timedelta(days=45)).isoformat(),
                    "last_used_at": (now - timedelta(minutes=6)).isoformat(),
                },
                {
                    "id": "key_acme_ci_02",
                    "name": "Staging Eval Runner",
                    "prefix": "ps_live_3d8e...19b0",
                    "scopes": ["chat:write"],
                    "status": "active",
                    "created_at": (now - timedelta(days=19)).isoformat(),
                    "last_used_at": (now - timedelta(hours=3)).isoformat(),
                },
            ],
            "invoices": [
                {
                    "id": "inv_2026_11_acme",
                    "date": (now - timedelta(days=12)).date().isoformat(),
                    "plan": "Pro",
                    "amount_usd": 49.00,
                    "status": "paid",
                },
                {
                    "id": "inv_2026_10_acme",
                    "date": (now - timedelta(days=42)).date().isoformat(),
                    "plan": "Pro",
                    "amount_usd": 49.00,
                    "status": "paid",
                },
            ],
        },
        "ws_orbit": {
            "id": "ws_orbit",
            "name": "Orbit Health",
            "slug": "orbit-health",
            "plan": "enterprise",
            "members_count": 34,
            "region": "eu-central-1",
            "created_at": (now - timedelta(days=180)).isoformat(),
            "daily_usage": orbit_daily,
            "model_usage": {
                "gpt-4o-mini": {"tokens": 2_420_000, "cost_usd": 0.968, "requests": 1410},
                "claude-3.5-sonnet": {"tokens": 2_610_000, "cost_usd": 24.31, "requests": 1120},
                "llama-3.1-70b-local": {"tokens": 1_150_000, "cost_usd": 0.214, "requests": 680},
            },
            "recent_requests": [
                {
                    "request_id": "req_e310a5f981bc",
                    "timestamp": (now - timedelta(minutes=3)).isoformat(),
                    "model": "claude-3.5-sonnet",
                    "prompt_tokens": 1120,
                    "completion_tokens": 640,
                    "total_tokens": 1760,
                    "cost_usd": 0.01296,
                    "latency_ms": 965,
                    "status": 200,
                },
                {
                    "request_id": "req_a129c7b044de",
                    "timestamp": (now - timedelta(minutes=14)).isoformat(),
                    "model": "llama-3.1-70b-local",
                    "prompt_tokens": 890,
                    "completion_tokens": 510,
                    "total_tokens": 1400,
                    "cost_usd": 0.000194,
                    "latency_ms": 530,
                    "status": 200,
                },
            ],
            "api_keys": [
                {
                    "id": "key_orbit_core_01",
                    "name": "Clinical Triage Pipeline",
                    "prefix": "ps_live_71ab...04fe",
                    "scopes": ["chat:write", "usage:read", "billing:read"],
                    "status": "active",
                    "created_at": (now - timedelta(days=110)).isoformat(),
                    "last_used_at": (now - timedelta(minutes=3)).isoformat(),
                },
                {
                    "id": "key_orbit_audit_02",
                    "name": "Compliance Telemetry Exporter",
                    "prefix": "ps_live_50cd...88a2",
                    "scopes": ["usage:read"],
                    "status": "active",
                    "created_at": (now - timedelta(days=62)).isoformat(),
                    "last_used_at": (now - timedelta(minutes=47)).isoformat(),
                },
            ],
            "invoices": [
                {
                    "id": "inv_2026_11_orbit",
                    "date": (now - timedelta(days=8)).date().isoformat(),
                    "plan": "Enterprise",
                    "amount_usd": 249.00,
                    "status": "paid",
                },
                {
                    "id": "inv_2026_10_orbit",
                    "date": (now - timedelta(days=38)).date().isoformat(),
                    "plan": "Enterprise",
                    "amount_usd": 249.00,
                    "status": "paid",
                },
            ],
        },
        "ws_solo": {
            "id": "ws_solo",
            "name": "Solo Dev",
            "slug": "solo-dev",
            "plan": "free",
            "members_count": 1,
            "region": "us-west-2",
            "created_at": (now - timedelta(days=22)).isoformat(),
            "daily_usage": solo_daily,
            "model_usage": {
                "gpt-4o-mini": {"tokens": 62_400, "cost_usd": 0.024, "requests": 48},
                "claude-3.5-sonnet": {"tokens": 9_000, "cost_usd": 0.081, "requests": 7},
                "llama-3.1-70b-local": {"tokens": 15_000, "cost_usd": 0.003, "requests": 14},
            },
            "recent_requests": [
                {
                    "request_id": "req_1f88b3e290aa",
                    "timestamp": (now - timedelta(minutes=38)).isoformat(),
                    "model": "gpt-4o-mini",
                    "prompt_tokens": 240,
                    "completion_tokens": 190,
                    "total_tokens": 430,
                    "cost_usd": 0.00015,
                    "latency_ms": 385,
                    "status": 200,
                }
            ],
            "api_keys": [
                {
                    "id": "key_solo_dev_01",
                    "name": "Local Prototype Key",
                    "prefix": "ps_live_14ef...77c9",
                    "scopes": ["chat:write", "usage:read"],
                    "status": "active",
                    "created_at": (now - timedelta(days=18)).isoformat(),
                    "last_used_at": (now - timedelta(minutes=38)).isoformat(),
                }
            ],
            "invoices": [
                {
                    "id": "inv_2026_11_solo",
                    "date": (now - timedelta(days=22)).date().isoformat(),
                    "plan": "Free",
                    "amount_usd": 0.00,
                    "status": "paid",
                }
            ],
        },
    }


STATE: dict[str, dict[str, Any]] = create_seed_state()


def get_workspace_or_404(workspace_id: str) -> dict[str, Any]:
    ws = STATE.get(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace '{workspace_id}' not found")
    return ws


def compute_workspace_totals(ws: dict[str, Any]) -> dict[str, Any]:
    plan_cfg = PLANS[ws["plan"]]
    total_tokens = sum(m["tokens"] for m in ws["model_usage"].values())
    total_cost = round(sum(m["cost_usd"] for m in ws["model_usage"].values()), 4)
    total_requests = sum(m["requests"] for m in ws["model_usage"].values())
    quota = plan_cfg["token_quota"]
    percent_used = round((total_tokens / quota) * 100, 1) if quota > 0 else 0.0
    active_keys = sum(1 for k in ws["api_keys"] if k["status"] == "active")
    recent = ws["recent_requests"]
    avg_latency = (
        int(sum(r["latency_ms"] for r in recent) / len(recent)) if recent else 420
    )
    return {
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost,
        "total_requests": total_requests,
        "token_quota": quota,
        "percent_used": percent_used,
        "soft_limit_reached": percent_used >= 80.0,
        "hard_limit_reached": total_tokens >= quota,
        "active_api_keys": active_keys,
        "avg_latency_ms": avg_latency,
    }


def serialize_workspace_summary(ws: dict[str, Any]) -> dict[str, Any]:
    totals = compute_workspace_totals(ws)
    plan_cfg = PLANS[ws["plan"]]
    return {
        "id": ws["id"],
        "name": ws["name"],
        "slug": ws["slug"],
        "plan": ws["plan"],
        "plan_name": plan_cfg["name"],
        "price_monthly_usd": plan_cfg["price_monthly_usd"],
        "members_count": ws["members_count"],
        "region": ws["region"],
        "created_at": ws["created_at"],
        **totals,
    }


def record_usage(
    ws: dict[str, Any],
    request_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    latency_ms: int,
    status: int = 200,
) -> dict[str, Any]:
    total_tokens = prompt_tokens + completion_tokens
    cost_usd = estimate_cost(model, prompt_tokens, completion_tokens)
    entry = {
        "request_id": request_id,
        "timestamp": utc_now_iso(),
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "cost_usd": cost_usd,
        "latency_ms": latency_ms,
        "status": status,
    }
    ws["recent_requests"].insert(0, entry)
    ws["recent_requests"] = ws["recent_requests"][:30]

    model_bucket = ws["model_usage"].setdefault(
        model, {"tokens": 0, "cost_usd": 0.0, "requests": 0}
    )
    model_bucket["tokens"] += total_tokens
    model_bucket["cost_usd"] = round(model_bucket["cost_usd"] + cost_usd, 6)
    model_bucket["requests"] += 1

    today_str = datetime.now(timezone.utc).date().isoformat()
    if ws["daily_usage"] and ws["daily_usage"][-1]["date"] == today_str:
        ws["daily_usage"][-1]["tokens"] += total_tokens
        ws["daily_usage"][-1]["cost_usd"] = round(
            ws["daily_usage"][-1]["cost_usd"] + cost_usd, 6
        )
        ws["daily_usage"][-1]["requests"] += 1
    else:
        ws["daily_usage"].append(
            {
                "date": today_str,
                "tokens": total_tokens,
                "cost_usd": cost_usd,
                "requests": 1,
            }
        )
        ws["daily_usage"] = ws["daily_usage"][-14:]

    return entry


class ChatStreamRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=8000)
    model: Literal["gpt-4o-mini", "claude-3.5-sonnet", "llama-3.1-70b-local"] = "gpt-4o-mini"
    temperature: float = Field(default=0.7, ge=0.0, le=1.5)
    system_prompt: str | None = Field(default=None, max_length=2000)


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    scopes: list[str] = Field(default_factory=lambda: ["chat:write", "usage:read"])


class CheckoutRequest(BaseModel):
    target_plan: Literal["free", "pro", "enterprise"]
    simulate_immediate: bool = False


class StripeWebhookPayload(BaseModel):
    type: str
    data: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(
    title="PulseStack AI Gateway",
    version=APP_VERSION,
    description="Multi-tenant AI workspace metering, streaming gateway, API keys, and Stripe billing API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next: Any) -> Response:
    req_id = request.headers.get("X-Request-ID") or f"req_{secrets.token_hex(6)}"
    request.state.request_id = req_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = req_id
    return response


@app.get("/health")
async def health(request: Request) -> dict[str, Any]:
    return envelope(
        request,
        {
            "status": "ok",
            "service": "pulsestack-ai-backend",
            "version": APP_VERSION,
            "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
            "stripe_configured": bool(os.getenv("STRIPE_SECRET_KEY")),
        },
    )


@app.get("/api/v1/workspaces")
async def list_workspaces(request: Request) -> dict[str, Any]:
    return envelope(
        request,
        {
            "workspaces": [serialize_workspace_summary(ws) for ws in STATE.values()],
            "models": list(MODELS.values()),
            "plans": list(PLANS.values()),
        },
    )


def _build_deterministic_reply(
    ws: dict[str, Any], model: str, prompt: str, temperature: float
) -> str:
    clean_prompt = prompt.strip()
    lower = clean_prompt.lower()
    if any(k in lower for k in ["sql", "query", "postgres", "database", "schema"]):
        return (
            f"### Multi-Tenant Metering Schema ({model})\n\n"
            f"For **{ws['name']}** (`{ws['plan'].upper()}` tier), partition usage events by "
            "`workspace_id` and `created_at` to keep billing rollups sub-10ms:\n\n"
            "```sql\n"
            "CREATE TABLE token_usage_events (\n"
            "  request_id TEXT PRIMARY KEY,\n"
            "  workspace_id TEXT NOT NULL,\n"
            "  model TEXT NOT NULL,\n"
            "  prompt_tokens INT NOT NULL,\n"
            "  completion_tokens INT NOT NULL,\n"
            "  cost_usd NUMERIC(10, 6) NOT NULL,\n"
            "  created_at TIMESTAMPTZ DEFAULT NOW()\n"
            ");\n"
            "CREATE INDEX idx_usage_ws_date ON token_usage_events (workspace_id, created_at DESC);\n"
            "```\n\n"
            "Attach a Redis token bucket per workspace to enforce hard quotas before upstream model calls."
        )
    if any(k in lower for k in ["stripe", "billing", "webhook", "subscription", "invoice"]):
        return (
            f"### Stripe Billing & Quota Sync ({model})\n\n"
            f"Workspace **{ws['name']}** is currently on the **{PLANS[ws['plan']]['name']}** plan.\n\n"
            "Recommended production flow:\n"
            "1. Create a Stripe Checkout Session with `metadata.workspace_id` and `metadata.target_plan`.\n"
            "2. Verify `Stripe-Signature` on `POST /api/v1/webhooks/stripe` using the raw request body.\n"
            "3. On `checkout.session.completed`, atomically update the tenant plan, reset the token quota ceiling, "
            "and persist the invoice record with idempotency key `event.id`.\n"
            "4. Emit soft-limit alerts at 80% utilization and return HTTP `429` once hard quota is reached."
        )
    return (
        f"### PulseStack Gateway Response (`{model}` · temp `{temperature:.1f}`)\n\n"
        f"Processed request for **{ws['name']}** (`{ws['region']}`).\n\n"
        f"**Prompt summary:** {clean_prompt[:180]}\n\n"
        "**Key takeaways:**\n"
        "- Request is isolated to tenant namespace `" + ws["id"] + "` with real-time token & USD metering.\n"
        "- Streaming tokens are delivered over Server-Sent Events (SSE) with per-request `X-Request-ID` tracing.\n"
        "- Usage counters, 14-day analytics, and quota guardrails update immediately upon stream completion."
    )


async def _stream_openai_or_fallback(
    ws: dict[str, Any],
    request_id: str,
    payload: ChatStreamRequest,
) -> AsyncGenerator[str, None]:
    started = time.perf_counter()
    prompt_tokens = max(12, len(payload.prompt.split()) * 2 + (len(payload.system_prompt.split()) if payload.system_prompt else 0))

    yield f"data: {json.dumps({'type': 'meta', 'request_id': request_id, 'model': payload.model, 'workspace_id': ws['id']})}\n\n"

    openai_key = os.getenv("OPENAI_API_KEY")
    collected_text = ""
    used_live_openai = False

    if openai_key and payload.model == "gpt-4o-mini":
        try:
            messages = []
            if payload.system_prompt:
                messages.append({"role": "system", "content": payload.system_prompt})
            messages.append({"role": "user", "content": payload.prompt})
            async with httpx.AsyncClient(timeout=20.0) as client:
                async with client.stream(
                    "POST",
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": messages,
                        "temperature": payload.temperature,
                        "stream": True,
                    },
                ) as resp:
                    if resp.status_code == 200:
                        used_live_openai = True
                        async for line in resp.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            raw = line[6:].strip()
                            if raw == "[DONE]":
                                break
                            chunk = json.loads(raw)
                            delta = chunk["choices"][0].get("delta", {}).get("content")
                            if delta:
                                collected_text += delta
                                yield f"data: {json.dumps({'type': 'delta', 'content': delta})}\n\n"
        except Exception:
            used_live_openai = False

    if not used_live_openai:
        reply = _build_deterministic_reply(ws, payload.model, payload.prompt, payload.temperature)
        words = reply.split(" ")
        for idx, word in enumerate(words):
            piece = word if idx == 0 else f" {word}"
            collected_text += piece
            yield f"data: {json.dumps({'type': 'delta', 'content': piece})}\n\n"
            await asyncio.sleep(0.015)

    latency_ms = max(120, int((time.perf_counter() - started) * 1000))
    completion_tokens = max(24, int(len(collected_text.split()) * 1.45))

    entry = record_usage(
        ws=ws,
        request_id=request_id,
        model=payload.model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        latency_ms=latency_ms,
        status=200,
    )
    totals = compute_workspace_totals(ws)
    done_payload = {
        "type": "done",
        **entry,
        "provider_mode": "openai-live" if used_live_openai else "deterministic-gateway",
        "workspace_totals": totals,
    }
    yield f"data: {json.dumps(done_payload)}\n\n"


@app.post("/api/v1/workspaces/{workspace_id}/chat/stream")
async def chat_stream(
    workspace_id: str,
    payload: ChatStreamRequest,
    request: Request,
) -> StreamingResponse:
    ws = get_workspace_or_404(workspace_id)
    totals = compute_workspace_totals(ws)
    if totals["hard_limit_reached"]:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Workspace '{ws['name']}' has reached its monthly token quota "
                f"({totals['token_quota']:,} tokens). Upgrade plan in Billing to continue."
            ),
        )

    request_id = getattr(request.state, "request_id", f"req_{secrets.token_hex(6)}")
    return StreamingResponse(
        _stream_openai_or_fallback(ws, request_id, payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Request-ID": request_id,
        },
    )


@app.get("/api/v1/workspaces/{workspace_id}/usage")
async def get_usage(workspace_id: str, request: Request) -> dict[str, Any]:
    ws = get_workspace_or_404(workspace_id)
    totals = compute_workspace_totals(ws)
    total_tokens = max(1, totals["total_tokens"])
    model_split = [
        {
            "model": model_id,
            "provider": MODELS.get(model_id, {}).get("provider", "Custom"),
            "tokens": stats["tokens"],
            "cost_usd": round(stats["cost_usd"], 4),
            "requests": stats["requests"],
            "share_pct": round((stats["tokens"] / total_tokens) * 100, 1),
        }
        for model_id, stats in ws["model_usage"].items()
    ]
    model_split.sort(key=lambda item: item["tokens"], reverse=True)

    return envelope(
        request,
        {
            "workspace": serialize_workspace_summary(ws),
            "daily_usage": ws["daily_usage"],
            "model_split": model_split,
            "recent_requests": ws["recent_requests"],
            "invoices": ws["invoices"],
            "plans": list(PLANS.values()),
        },
    )


@app.get("/api/v1/workspaces/{workspace_id}/api-keys")
async def list_api_keys(workspace_id: str, request: Request) -> dict[str, Any]:
    ws = get_workspace_or_404(workspace_id)
    return envelope(request, {"api_keys": ws["api_keys"]})


@app.post("/api/v1/workspaces/{workspace_id}/api-keys", status_code=201)
async def create_api_key(
    workspace_id: str,
    payload: CreateApiKeyRequest,
    request: Request,
) -> dict[str, Any]:
    ws = get_workspace_or_404(workspace_id)
    plan_cfg = PLANS[ws["plan"]]
    active_count = sum(1 for k in ws["api_keys"] if k["status"] == "active")
    if active_count >= plan_cfg["max_api_keys"]:
        raise HTTPException(
            status_code=403,
            detail=f"Plan '{plan_cfg['name']}' allows at most {plan_cfg['max_api_keys']} active API keys.",
        )

    raw_secret = f"ps_live_{secrets.token_hex(16)}"
    masked_prefix = f"{raw_secret[:12]}...{raw_secret[-4:]}"
    key_record = {
        "id": f"key_{secrets.token_hex(6)}",
        "name": payload.name.strip(),
        "prefix": masked_prefix,
        "scopes": payload.scopes or ["chat:write"],
        "status": "active",
        "created_at": utc_now_iso(),
        "last_used_at": None,
    }
    ws["api_keys"].insert(0, key_record)
    return envelope(
        request,
        {
            "api_key": key_record,
            "secret_key": raw_secret,
        },
    )


@app.delete("/api/v1/workspaces/{workspace_id}/api-keys/{key_id}")
async def revoke_api_key(
    workspace_id: str,
    key_id: str,
    request: Request,
) -> dict[str, Any]:
    ws = get_workspace_or_404(workspace_id)
    for key in ws["api_keys"]:
        if key["id"] == key_id:
            key["status"] = "revoked"
            key["revoked_at"] = utc_now_iso()
            return envelope(request, {"api_key": key})
    raise HTTPException(status_code=404, detail=f"API key '{key_id}' not found")


def _apply_plan_change(ws: dict[str, Any], target_plan: str) -> dict[str, Any]:
    plan_cfg = PLANS[target_plan]
    ws["plan"] = target_plan
    invoice = {
        "id": f"inv_{datetime.now(timezone.utc).strftime('%Y_%m')}_{secrets.token_hex(3)}",
        "date": datetime.now(timezone.utc).date().isoformat(),
        "plan": plan_cfg["name"],
        "amount_usd": float(plan_cfg["price_monthly_usd"]),
        "status": "paid",
    }
    ws["invoices"].insert(0, invoice)
    return invoice


@app.post("/api/v1/workspaces/{workspace_id}/billing/checkout")
async def create_checkout_session(
    workspace_id: str,
    payload: CheckoutRequest,
    request: Request,
) -> dict[str, Any]:
    ws = get_workspace_or_404(workspace_id)
    plan_cfg = PLANS[payload.target_plan]
    stripe_key = os.getenv("STRIPE_SECRET_KEY")

    if stripe_key and payload.target_plan != "free":
        try:
            import stripe  # type: ignore

            stripe.api_key = stripe_key
            base_url = os.getenv("FRONTEND_URL", "http://localhost:3003")
            session = stripe.checkout.Session.create(
                mode="subscription",
                line_items=[
                    {
                        "price_data": {
                            "currency": "usd",
                            "product_data": {"name": f"PulseStack AI — {plan_cfg['name']} Plan"},
                            "unit_amount": int(plan_cfg["price_monthly_usd"] * 100),
                            "recurring": {"interval": "month"},
                        },
                        "quantity": 1,
                    }
                ],
                metadata={"workspace_id": workspace_id, "target_plan": payload.target_plan},
                success_url=f"{base_url}?checkout=success&plan={payload.target_plan}",
                cancel_url=f"{base_url}?checkout=cancelled",
            )
            return envelope(
                request,
                {
                    "mode": "stripe-live",
                    "session_id": session.id,
                    "checkout_url": session.url,
                    "workspace": serialize_workspace_summary(ws),
                },
            )
        except Exception:
            pass

    session_id = f"cs_demo_{secrets.token_hex(8)}"
    invoice = None
    if payload.simulate_immediate:
        invoice = _apply_plan_change(ws, payload.target_plan)

    return envelope(
        request,
        {
            "mode": "demo",
            "session_id": session_id,
            "checkout_url": None,
            "target_plan": payload.target_plan,
            "applied": payload.simulate_immediate,
            "invoice": invoice,
            "workspace": serialize_workspace_summary(ws),
        },
    )


@app.post("/api/v1/webhooks/stripe")
async def stripe_webhook(payload: StripeWebhookPayload, request: Request) -> dict[str, Any]:
    event_type = payload.type
    obj = payload.data.get("object", {})
    metadata = obj.get("metadata", {})
    workspace_id = metadata.get("workspace_id")
    target_plan = metadata.get("target_plan")

    if event_type == "checkout.session.completed":
        if not workspace_id or target_plan not in PLANS:
            raise HTTPException(
                status_code=400,
                detail="Missing valid metadata.workspace_id or metadata.target_plan",
            )
        ws = get_workspace_or_404(workspace_id)
        invoice = _apply_plan_change(ws, target_plan)
        return envelope(
            request,
            {
                "received": True,
                "event_type": event_type,
                "workspace": serialize_workspace_summary(ws),
                "invoice": invoice,
            },
        )

    return envelope(
        request,
        {
            "received": True,
            "event_type": event_type,
            "ignored": True,
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8003")), reload=True)
