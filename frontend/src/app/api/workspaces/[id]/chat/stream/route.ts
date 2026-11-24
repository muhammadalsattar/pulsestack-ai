import { NextResponse } from "next/server";
import {
  buildDeterministicReply,
  getFastApiUrl,
  getStore,
  makeRequestId,
  recordWorkspaceUsage,
  serializeWorkspace,
} from "@/lib/store";
import type { ModelId } from "@/lib/types";

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
        `${fastApi}/api/v1/workspaces/${id}/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (upstream.ok && upstream.body) {
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Request-ID":
              upstream.headers.get("X-Request-ID") ?? makeRequestId(),
          },
        });
      }
      if (upstream.status === 429 || upstream.status === 404) {
        return NextResponse.json(await upstream.json(), {
          status: upstream.status,
        });
      }
    } catch {
      // Fall through to in-app SSE streaming engine
    }
  }

  const ws = getStore()[id];
  if (!ws) {
    return NextResponse.json(
      { detail: `Workspace '${id}' not found` },
      { status: 404 }
    );
  }

  const summary = serializeWorkspace(ws);
  if (summary.hard_limit_reached) {
    return NextResponse.json(
      {
        detail: `Workspace '${ws.name}' has reached its monthly token quota (${summary.token_quota.toLocaleString()} tokens). Upgrade plan in Billing to continue.`,
      },
      { status: 429 }
    );
  }

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json(
      { detail: "Prompt cannot be empty" },
      { status: 400 }
    );
  }

  const model: ModelId =
    body.model === "claude-3.5-sonnet" || body.model === "llama-3.1-70b-local"
      ? body.model
      : "gpt-4o-mini";
  const temperature =
    typeof body.temperature === "number"
      ? Math.min(1.5, Math.max(0, body.temperature))
      : 0.7;
  const systemPrompt = body.system_prompt ? String(body.system_prompt) : "";

  const requestId = makeRequestId();
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      push({
        type: "meta",
        request_id: requestId,
        model,
        workspace_id: ws.id,
      });

      const reply = buildDeterministicReply(ws, model, prompt, temperature);
      const words = reply.split(" ");
      for (let i = 0; i < words.length; i++) {
        const piece = i === 0 ? words[i] : ` ${words[i]}`;
        push({ type: "delta", content: piece });
        await new Promise((r) => setTimeout(r, 18));
      }

      const latencyMs = Math.max(140, Date.now() - startedAt);
      const promptTokens = Math.max(
        14,
        prompt.split(/\s+/).length * 2 +
          (systemPrompt ? systemPrompt.split(/\s+/).length : 0)
      );
      const completionTokens = Math.max(28, Math.round(words.length * 1.45));

      const entry = recordWorkspaceUsage(ws, {
        request_id: requestId,
        model,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        latency_ms: latencyMs,
        status: 200,
      });

      const updatedSummary = serializeWorkspace(ws);
      push({
        type: "done",
        ...entry,
        provider_mode: "in-app-gateway",
        workspace_totals: updatedSummary,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Request-ID": requestId,
    },
  });
}
