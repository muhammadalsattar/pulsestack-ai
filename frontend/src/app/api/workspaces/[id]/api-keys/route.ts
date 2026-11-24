import crypto from "crypto";
import { NextResponse } from "next/server";
import { envelope, getFastApiUrl, getStore, PLANS } from "@/lib/store";
import type { ApiKeyRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const fastApi = getFastApiUrl();

  if (fastApi) {
    try {
      const upstream = await fetch(
        `${fastApi}/api/v1/workspaces/${id}/api-keys`,
        { cache: "no-store" }
      );
      if (upstream.ok) {
        return NextResponse.json(await upstream.json());
      }
    } catch {
      // Fall through to in-app engine
    }
  }

  const ws = getStore()[id];
  if (!ws) {
    return NextResponse.json(
      { detail: `Workspace '${id}' not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(envelope({ api_keys: ws.api_keys }));
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await req.json();
  const fastApi = getFastApiUrl();

  if (fastApi) {
    try {
      const upstream = await fetch(
        `${fastApi}/api/v1/workspaces/${id}/api-keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (upstream.ok || upstream.status === 403 || upstream.status === 400) {
        return NextResponse.json(await upstream.json(), {
          status: upstream.status,
        });
      }
    } catch {
      // Fall through to in-app engine
    }
  }

  const ws = getStore()[id];
  if (!ws) {
    return NextResponse.json(
      { detail: `Workspace '${id}' not found` },
      { status: 404 }
    );
  }

  const name = String(body.name ?? "").trim();
  if (name.length < 2) {
    return NextResponse.json(
      { detail: "Key name must be at least 2 characters" },
      { status: 400 }
    );
  }

  const plan = PLANS[ws.plan];
  const activeCount = ws.api_keys.filter((k) => k.status === "active").length;
  if (activeCount >= plan.max_api_keys) {
    return NextResponse.json(
      {
        detail: `Plan '${plan.name}' allows at most ${plan.max_api_keys} active API keys.`,
      },
      { status: 403 }
    );
  }

  const rawSecret = `ps_live_${crypto.randomBytes(16).toString("hex")}`;
  const scopes =
    Array.isArray(body.scopes) && body.scopes.length > 0
      ? body.scopes.map(String)
      : ["chat:write", "usage:read"];

  const record: ApiKeyRecord = {
    id: `key_${crypto.randomBytes(6).toString("hex")}`,
    name,
    prefix: `${rawSecret.slice(0, 12)}...${rawSecret.slice(-4)}`,
    scopes,
    status: "active",
    created_at: new Date().toISOString(),
    last_used_at: null,
  };

  ws.api_keys = [record, ...ws.api_keys];

  return NextResponse.json(
    envelope({ api_key: record, secret_key: rawSecret }),
    { status: 201 }
  );
}
