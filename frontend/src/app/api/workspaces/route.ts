import { NextResponse } from "next/server";
import {
  envelope,
  getFastApiUrl,
  getStore,
  MODELS,
  PLANS,
  serializeWorkspace,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const fastApi = getFastApiUrl();
  if (fastApi) {
    try {
      const upstream = await fetch(`${fastApi}/api/v1/workspaces`, {
        cache: "no-store",
      });
      if (upstream.ok) {
        const json = await upstream.json();
        return NextResponse.json({ ...json, backend_mode: "fastapi" });
      }
    } catch {
      // Fall through to in-app multi-tenant engine
    }
  }

  const store = getStore();
  const workspaces = Object.values(store).map(serializeWorkspace);
  return NextResponse.json({
    ...envelope({
      workspaces,
      models: Object.values(MODELS),
      plans: Object.values(PLANS),
    }),
    backend_mode: "demo-engine",
  });
}
