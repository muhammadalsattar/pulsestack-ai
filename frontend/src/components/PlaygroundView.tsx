"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  Play,
  Sliders,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";
import { formatUsd } from "@/lib/format";
import type { ModelConfig, ModelId, WorkspaceSummary } from "@/lib/types";

interface PlaygroundViewProps {
  workspace: WorkspaceSummary;
  models: ModelConfig[];
  onUsageUpdated: () => Promise<void>;
  onNavigateBilling: () => void;
}

interface RunTelemetry {
  request_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  provider_mode: string;
}

const PRESET_PROMPTS = [
  {
    label: "Metering SQL Schema",
    prompt:
      "Design a Postgres schema and indexing strategy for multi-tenant LLM token usage metering.",
  },
  {
    label: "Stripe Webhook Sync",
    prompt:
      "Outline a production Stripe Checkout + webhook handler flow for upgrading workspace token quotas.",
  },
  {
    label: "Gateway Architecture",
    prompt:
      "Summarize how to stream SSE completions with per-request X-Request-ID tracing and cost guardrails.",
  },
];

export function PlaygroundView({
  workspace,
  models,
  onUsageUpdated,
  onNavigateBilling,
}: PlaygroundViewProps) {
  const [selectedModel, setSelectedModel] = useState<ModelId>("gpt-4o-mini");
  const [temperature, setTemperature] = useState<number>(0.4);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are a concise principal AI systems architect."
  );
  const [prompt, setPrompt] = useState<string>(PRESET_PROMPTS[0].prompt);
  const [output, setOutput] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<RunTelemetry | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  const activeModelConfig =
    models.find((m) => m.id === selectedModel) ?? models[0];

  async function handleRun() {
    if (!prompt.trim() || isStreaming) return;
    setError(null);
    setQuotaBlocked(false);
    setOutput("");
    setTelemetry(null);
    setIsStreaming(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const resp = await fetch(
        `/api/workspaces/${workspace.id}/chat/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            model: selectedModel,
            temperature,
            system_prompt: systemPrompt || undefined,
          }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        if (resp.status === 429) {
          setQuotaBlocked(true);
        }
        setError(errBody.detail ?? `Gateway error (${resp.status})`);
        setIsStreaming(false);
        return;
      }

      if (!resp.body) {
        setError("Empty response stream from gateway");
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = JSON.parse(trimmed.slice(6));
          if (payload.type === "delta" && payload.content) {
            setOutput((prev) => prev + payload.content);
          } else if (payload.type === "done") {
            setTelemetry({
              request_id: payload.request_id,
              model: payload.model,
              prompt_tokens: payload.prompt_tokens,
              completion_tokens: payload.completion_tokens,
              total_tokens: payload.total_tokens,
              cost_usd: payload.cost_usd,
              latency_ms: payload.latency_ms,
              provider_mode: payload.provider_mode ?? "gateway",
            });
          }
        }
      }

      await onUsageUpdated();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message || "Streaming failed");
      }
    } finally {
      setIsStreaming(false);
      setAbortController(null);
    }
  }

  function handleStop() {
    abortController?.abort();
    setIsStreaming(false);
  }

  function handleCopy() {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      {/* Left Config & Prompt Column */}
      <div className="space-y-4 xl:col-span-5">
        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Sliders className="h-4 w-4 text-indigo-400" />
              Inference Parameters
            </h3>
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-slate-300">
              {workspace.slug}
            </span>
          </div>

          {/* Model Selector */}
          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium text-slate-400">
              Target Model
            </label>
            <div className="grid grid-cols-1 gap-2">
              {models.map((m) => {
                const active = m.id === selectedModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedModel(m.id)}
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition ${
                      active
                        ? "border-indigo-500/70 bg-indigo-500/10 text-white"
                        : "border-slate-800 bg-surface-0/70 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs font-semibold">
                        {m.id}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {m.provider} · {(m.context_window / 1000).toFixed(0)}K
                        ctx
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] text-slate-400">
                      <div>${m.input_per_1m_usd}/1M in</div>
                      <div>${m.output_per_1m_usd}/1M out</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Temperature Slider */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-slate-400">Temperature</label>
              <span className="font-mono text-slate-200">
                {temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Deterministic (0.0)</span>
              <span>Creative (1.5)</span>
            </div>
          </div>

          {/* System Prompt */}
          <div className="mt-4">
            <label className="text-xs font-medium text-slate-400">
              System Instruction
            </label>
            <input
              type="text"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-surface-0 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Optional system instruction..."
            />
          </div>
        </div>

        {/* Prompt Box */}
        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-white">Prompt</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PROMPTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPrompt(preset.prompt)}
                  className="rounded-md border border-slate-800 bg-surface-2 px-2 py-1 text-[11px] text-slate-300 transition hover:border-indigo-500/60 hover:text-white"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to stream through the metered gateway..."
            className="mt-3 w-full resize-none rounded-lg border border-slate-800 bg-surface-0 p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Metered to{" "}
              <strong className="text-slate-200">{workspace.name}</strong>
              {activeModelConfig
                ? ` · ${activeModelConfig.provider}`
                : ""}
            </span>

            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/30"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop Stream
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRun}
                disabled={!prompt.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Stream Completion
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Streaming Output Column */}
      <div className="flex flex-col rounded-xl border border-slate-800/80 bg-surface-1 xl:col-span-7">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">
              SSE Stream Output
            </span>
            {isStreaming && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                Streaming
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!output}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-surface-2 px-2.5 py-1 text-xs text-slate-300 transition hover:text-white disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        </div>

        {/* Error / Quota Exceeded State */}
        {error && (
          <div className="m-5 flex flex-col gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            {quotaBlocked && (
              <button
                onClick={onNavigateBilling}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-500/20 px-3 py-1.5 font-semibold text-white hover:bg-rose-500/30"
              >
                Upgrade Plan
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Stream Content */}
        <div className="min-h-[340px] flex-1 p-5">
          {output ? (
            <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-200">
              {output}
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-indigo-400 align-middle" />
              )}
            </pre>
          ) : (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
              <div className="rounded-full border border-slate-800 bg-surface-2 p-3">
                <Sparkles className="h-5 w-5 text-indigo-400" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-300">
                Ready to stream via PulseStack Gateway
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Tokens stream over Server-Sent Events and immediately increment{" "}
                {workspace.name}&apos;s usage meter, cost analytics, and
                telemetry log.
              </p>
            </div>
          )}
        </div>

        {/* Live Telemetry Footer */}
        <div className="border-t border-slate-800/80 bg-surface-0/70 px-5 py-3">
          {telemetry ? (
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Request ID
                </div>
                <div className="mt-0.5 font-mono text-slate-200">
                  {telemetry.request_id}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Latency
                </div>
                <div className="mt-0.5 font-mono text-sky-300">
                  {telemetry.latency_ms} ms
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Prompt / Comp
                </div>
                <div className="mt-0.5 font-mono text-slate-200">
                  {telemetry.prompt_tokens} / {telemetry.completion_tokens}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Est. Cost
                </div>
                <div className="mt-0.5 font-mono text-emerald-300">
                  {formatUsd(telemetry.cost_usd, 6)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Metered
                </div>
                <div className="mt-0.5 font-mono text-indigo-300">
                  +{telemetry.total_tokens} tok
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                Telemetry (request_id, latency, tokens, USD cost) appears upon
                completion.
              </span>
              <span className="font-mono text-[11px]">SSE · X-Request-ID</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
