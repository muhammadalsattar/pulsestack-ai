import { NextResponse } from "next/server";
import {
  envelope,
  getFastApiUrl,
  getStore,
  getWorkspaceUsage,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const fastApi = getFastApiUrl();

  if (fastApi) {
    try {
      const upstream = await fetch(`${fastApi}/api/v1/workspaces/${id}/usage`, {
        cache: "no-store",
      });
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

  return NextResponse.json(envelope(getWorkspaceUsage(ws)));
}
