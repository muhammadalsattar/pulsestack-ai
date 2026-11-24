import { NextResponse } from "next/server";
import { envelope, getFastApiUrl, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; keyId: string }> }
) {
  const { id, keyId } = await context.params;
  const fastApi = getFastApiUrl();

  if (fastApi) {
    try {
      const upstream = await fetch(
        `${fastApi}/api/v1/workspaces/${id}/api-keys/${keyId}`,
        { method: "DELETE" }
      );
      if (upstream.ok || upstream.status === 404) {
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

  const target = ws.api_keys.find((k) => k.id === keyId);
  if (!target) {
    return NextResponse.json(
      { detail: `API key '${keyId}' not found` },
      { status: 404 }
    );
  }

  target.status = "revoked";
  target.revoked_at = new Date().toISOString();

  return NextResponse.json(envelope({ api_key: target }));
}
