import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  applyWorkspacePlan,
  envelope,
  getFastApiUrl,
  getStore,
  PLANS,
  serializeWorkspace,
} from "@/lib/store";
import type { PlanId } from "@/lib/types";

export const dynamic = "force-dynamic";

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
        `${fastApi}/api/v1/workspaces/${id}/billing/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
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

  const targetPlan = body.target_plan as PlanId;
  if (!PLANS[targetPlan]) {
    return NextResponse.json(
      { detail: `Invalid plan '${String(targetPlan)}'` },
      { status: 400 }
    );
  }

  const simulateImmediate = Boolean(body.simulate_immediate);
  const sessionId = `cs_demo_${crypto.randomBytes(8).toString("hex")}`;
  const invoice = simulateImmediate ? applyWorkspacePlan(ws, targetPlan) : null;

  return NextResponse.json(
    envelope({
      mode: "demo",
      session_id: sessionId,
      checkout_url: null,
      target_plan: targetPlan,
      applied: simulateImmediate,
      invoice,
      workspace: serializeWorkspace(ws),
    })
  );
}
