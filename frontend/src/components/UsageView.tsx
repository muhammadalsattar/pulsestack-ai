"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Cpu,
  DollarSign,
  KeyRound,
  Zap,
} from "lucide-react";
import {
  formatRelativeTime,
  formatShortDate,
  formatTokens,
  formatUsd,
} from "@/lib/format";
import type { UsageResponseData } from "@/lib/types";

interface UsageViewProps {
  usage: UsageResponseData;
  onNavigateBilling: () => void;
  onNavigatePlayground: () => void;
}

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o-mini": "bg-emerald-500",
  "claude-3.5-sonnet": "bg-indigo-500",
  "llama-3.1-70b-local": "bg-sky-400",
};

export function UsageView({
  usage,
  onNavigateBilling,
  onNavigatePlayground,
}: UsageViewProps) {
  const [chartMetric, setChartMetric] = useState<"tokens" | "cost">("tokens");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { workspace, daily_usage, model_split, recent_requests } = usage;

  const maxVal = Math.max(
    1,
    ...daily_usage.map((d) => (chartMetric === "tokens" ? d.tokens : d.cost_usd))
  );

  const quotaPct = Math.min(100, workspace.percent_used);
  const quotaBarColor = workspace.hard_limit_reached
    ? "bg-rose-500"
    : workspace.soft_limit_reached
      ? "bg-amber-400"
      : "bg-indigo-500";

  return (
    <div className="space-y-6">
      {/* Soft / Hard Quota Alert Banner */}
      {(workspace.soft_limit_reached || workspace.hard_limit_reached) && (
        <div
          className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
            workspace.hard_limit_reached
              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                {workspace.hard_limit_reached
                  ? "Hard token quota reached — streaming requests are gated (HTTP 429)"
                  : `Soft quota warning — ${workspace.percent_used}% of monthly token allowance used`}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {workspace.name} has consumed{" "}
                {workspace.total_tokens.toLocaleString()} of{" "}
                {workspace.token_quota.toLocaleString()} tokens on the{" "}
                {workspace.plan_name} plan.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateBilling}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/20"
          >
            Upgrade Plan
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              Monthly Tokens
            </span>
            <Zap className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white">
              {formatTokens(workspace.total_tokens)}
            </span>
            <span className="text-xs text-slate-400">
              / {formatTokens(workspace.token_quota)}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {workspace.total_requests.toLocaleString()} metered requests
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              Inference Spend (MTD)
            </span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white">
              {formatUsd(workspace.total_cost_usd)}
            </span>
            <span className="text-xs text-slate-400">USD</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Plan base: ${workspace.price_monthly_usd}/mo ({workspace.plan_name})
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              Avg Gateway Latency
            </span>
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white">
              {workspace.avg_latency_ms}
            </span>
            <span className="text-xs text-slate-400">ms</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Region: <span className="font-mono">{workspace.region}</span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">
              Active API Keys
            </span>
            <KeyRound className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white">
              {workspace.active_api_keys}
            </span>
            <span className="text-xs text-slate-400">scoped keys</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {workspace.members_count} workspace member
            {workspace.members_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Quota Progress Bar */}
      <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Workspace Token Quota Guardrail
            </h3>
            <p className="text-xs text-slate-400">
              Soft warning at 80% · Hard HTTP 429 cutoff at 100%
            </p>
          </div>
          <div className="font-mono text-xs text-slate-300">
            {workspace.total_tokens.toLocaleString()} /{" "}
            {workspace.token_quota.toLocaleString()} tokens (
            <span className="font-semibold text-white">
              {workspace.percent_used}%
            </span>
            )
          </div>
        </div>
        <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${quotaBarColor}`}
            style={{ width: `${quotaPct}%` }}
          />
          {/* 80% soft threshold marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-amber-400/70"
            style={{ left: "80%" }}
            title="80% soft limit threshold"
          />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 14-day Token & Cost Chart */}
        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                14-Day Usage &amp; Cost Telemetry
              </h3>
              <p className="text-xs text-slate-400">
                Daily metered totals for {workspace.name}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-800 bg-surface-0 p-0.5 text-xs">
              <button
                onClick={() => setChartMetric("tokens")}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  chartMetric === "tokens"
                    ? "bg-surface-3 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Tokens
              </button>
              <button
                onClick={() => setChartMetric("cost")}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  chartMetric === "cost"
                    ? "bg-surface-3 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                USD Cost
              </button>
            </div>
          </div>

          {/* Hover summary line */}
          <div className="mt-3 flex h-6 items-center text-xs text-slate-400">
            {hoveredIdx !== null && daily_usage[hoveredIdx] ? (
              <span className="font-mono text-slate-200">
                {formatShortDate(daily_usage[hoveredIdx].date)}:{" "}
                <strong className="text-indigo-300">
                  {daily_usage[hoveredIdx].tokens.toLocaleString()} tokens
                </strong>{" "}
                ·{" "}
                <strong className="text-emerald-300">
                  {formatUsd(daily_usage[hoveredIdx].cost_usd, 4)}
                </strong>{" "}
                · {daily_usage[hoveredIdx].requests} reqs
              </span>
            ) : (
              <span>Hover any bar to inspect daily token &amp; cost totals</span>
            )}
          </div>

          <div className="mt-4 flex h-48 items-end gap-1.5 sm:gap-2">
            {daily_usage.map((point, idx) => {
              const val =
                chartMetric === "tokens" ? point.tokens : point.cost_usd;
              const heightPct = Math.max(6, Math.round((val / maxVal) * 100));
              const isToday = idx === daily_usage.length - 1;
              return (
                <div
                  key={point.date}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
                >
                  <div className="flex h-full w-full items-end">
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        chartMetric === "tokens"
                          ? isToday
                            ? "bg-indigo-400 group-hover:bg-indigo-300"
                            : "bg-indigo-500/70 group-hover:bg-indigo-400"
                          : isToday
                            ? "bg-emerald-400 group-hover:bg-emerald-300"
                            : "bg-emerald-500/70 group-hover:bg-emerald-400"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {idx % 2 === 0 || isToday
                      ? formatShortDate(point.date).split(" ")[1]
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Split Breakdown */}
        <div className="rounded-xl border border-slate-800/80 bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Model Split</h3>
              <p className="text-xs text-slate-400">Share of total tokens</p>
            </div>
            <Cpu className="h-4 w-4 text-slate-500" />
          </div>

          <div className="mt-5 space-y-4">
            {model_split.map((item) => (
              <div key={item.model} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-medium text-slate-200">
                      {item.model}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-500">
                      {item.provider}
                    </span>
                  </div>
                  <span className="font-mono text-slate-300">
                    {item.share_pct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full ${
                      MODEL_COLORS[item.model] ?? "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.max(2, item.share_pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{formatTokens(item.tokens)} tokens</span>
                  <span className="font-mono">
                    {formatUsd(item.cost_usd, 4)} · {item.requests} reqs
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onNavigatePlayground}
            className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-700/80 bg-surface-2 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-indigo-500/60 hover:text-white"
          >
            Test Models in Playground
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Recent Request Telemetry Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-surface-1">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Recent Request Telemetry
            </h3>
            <p className="text-xs text-slate-400">
              Live SSE gateway log with per-request X-Request-ID tracing
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] text-emerald-300">
            {recent_requests.length} logged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800/80 bg-surface-0/60 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Request ID</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Tokens (In / Out)</th>
                <th className="px-4 py-3 font-medium">Cost</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recent_requests.map((req) => (
                <tr
                  key={req.request_id}
                  className="transition hover:bg-surface-2/50"
                >
                  <td className="px-5 py-3 font-mono text-slate-200">
                    {req.request_id}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700/80 bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-slate-200">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          MODEL_COLORS[req.model] ?? "bg-indigo-400"
                        }`}
                      />
                      {req.model}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">
                    {req.total_tokens.toLocaleString()}{" "}
                    <span className="text-slate-500">
                      ({req.prompt_tokens}/{req.completion_tokens})
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-emerald-300">
                    {formatUsd(req.cost_usd, 6)}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300">
                    {req.latency_ms} ms
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                      {req.status} OK
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {formatRelativeTime(req.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
