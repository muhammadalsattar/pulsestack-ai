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

export async function POST(req: Request) {
  const body = await req.json();
  const fastApi = getFastApiUrl();

  if (fastApi) {
    try {
      const upstream = await fetch(`${fastApi}/api/v1/webhooks/stripe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (upstream.ok) {
        return NextResponse.json(await upstream.json());
      }
    } catch {
      // Fall through to in-app engine
    }
  }

  const eventType = String(body.type ?? "");
  const metadata = body?.data?.object?.metadata ?? {};
  const workspaceId = String(metadata.workspace_id ?? "");
  const targetPlan = metadata.target_plan as PlanId;

  if (eventType === "checkout.session.completed") {
    const ws = getStore()[workspaceId];
    if (!ws || !PLANS[targetPlan]) {
      return NextResponse.json(
        { detail: "Missing valid workspace_id or target_plan in metadata" },
        { status: 400 }
      );
    }
    const invoice = applyWorkspacePlan(ws, targetPlan);
    return NextResponse.json(
      envelope({
        received: true,
        event_type: eventType,
        workspace: serializeWorkspace(ws),
        invoice,
      })
    );
  }

  return NextResponse.json(
    envelope({ received: true, event_type: eventType, ignored: true })
  );
}
