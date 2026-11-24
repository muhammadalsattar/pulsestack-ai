"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  ChevronDown,
  CreditCard,
  KeyRound,
  Layers,
  RefreshCw,
  Terminal,
  Zap,
} from "lucide-react";
import { formatTokens } from "@/lib/format";
import type {
  ApiKeyRecord,
  ModelConfig,
  PlanConfig,
  UsageResponseData,
  WorkspaceSummary,
} from "@/lib/types";
import { ApiKeysView } from "./ApiKeysView";
import { BillingView } from "./BillingView";
import { PlaygroundView } from "./PlaygroundView";
import { UsageView } from "./UsageView";

type TabId = "analytics" | "playground" | "api-keys" | "billing";

const NAV_ITEMS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: "analytics", label: "Usage & Analytics", icon: BarChart3 },
  { id: "playground", label: "AI Playground", icon: Terminal },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "billing", label: "Billing & Plans", icon: CreditCard },
];

export function DashboardShell() {
  const [activeTab, setActiveTab] = useState<TabId>("analytics");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>("ws_acme");
  const [usage, setUsage] = useState<UsageResponseData | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [backendMode, setBackendMode] = useState<string>("demo-engine");
  const [loading, setLoading] = useState<boolean>(true);
  const [switcherOpen, setSwitcherOpen] = useState<boolean>(false);

  const loadWorkspaceDetails = useCallback(async (wsId: string) => {
    const [usageResp, keysResp, listResp] = await Promise.all([
      fetch(`/api/workspaces/${wsId}/usage`, { cache: "no-store" }),
      fetch(`/api/workspaces/${wsId}/api-keys`, { cache: "no-store" }),
      fetch("/api/workspaces", { cache: "no-store" }),
    ]);

    if (listResp.ok) {
      const listJson = await listResp.json();
      setWorkspaces(listJson.data.workspaces ?? []);
      setModels(listJson.data.models ?? []);
      setPlans(listJson.data.plans ?? []);
      if (listJson.backend_mode) setBackendMode(listJson.backend_mode);
    }

    if (usageResp.ok) {
      const usageJson = await usageResp.json();
      setUsage(usageJson.data);
    }

    if (keysResp.ok) {
      const keysJson = await keysResp.json();
      setApiKeys(keysJson.data.api_keys ?? []);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadWorkspaceDetails(selectedWsId).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [selectedWsId, loadWorkspaceDetails]);

  const activeWorkspace =
    usage?.workspace ?? workspaces.find((w) => w.id === selectedWsId) ?? null;

  const handleRefresh = useCallback(async () => {
    await loadWorkspaceDetails(selectedWsId);
  }, [loadWorkspaceDetails, selectedWsId]);

  const quotaPct = activeWorkspace
    ? Math.min(100, activeWorkspace.percent_used)
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-surface-0 lg:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-slate-800/80 bg-surface-1 lg:w-64 lg:border-b-0 lg:border-r">
        {/* Brand */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-600/25">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">
                PulseStack AI
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                Multi-Tenant Gateway
              </div>
            </div>
          </div>
        </div>

        {/* Workspace Switcher */}
        <div className="relative p-3">
          <button
            type="button"
            onClick={() => setSwitcherOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-surface-0 px-3 py-2.5 text-left transition hover:border-slate-700"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-indigo-400">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-white">
                  {activeWorkspace?.name ?? "Loading..."}
                </div>
                <div className="text-[11px] text-slate-400">
                  {activeWorkspace
                    ? `${activeWorkspace.plan_name} Plan`
                    : "Workspace"}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition ${
                switcherOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {switcherOpen && (
            <div className="absolute left-3 right-3 top-[66px] z-30 overflow-hidden rounded-xl border border-slate-700/80 bg-surface-2 p-1.5 shadow-2xl">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Switch Organization
              </div>
              {workspaces.map((ws) => {
                const selected = ws.id === selectedWsId;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setSelectedWsId(ws.id);
                      setSwitcherOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      selected
                        ? "bg-indigo-600/20 text-white"
                        : "text-slate-300 hover:bg-surface-3"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{ws.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {ws.region} · {ws.percent_used}% quota
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        ws.plan === "enterprise"
                          ? "bg-purple-500/20 text-purple-300"
                          : ws.plan === "pro"
                            ? "bg-indigo-500/20 text-indigo-300"
                            : "bg-slate-700/80 text-slate-300"
                      }`}
                    >
                      {ws.plan_name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-row gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:pb-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  active
                    ? "bg-indigo-600/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/30"
                    : "text-slate-400 hover:bg-surface-2 hover:text-slate-200"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    active ? "text-indigo-400" : "text-slate-500"
                  }`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Quota Widget */}
        {activeWorkspace && (
          <div className="hidden border-t border-slate-800/80 p-4 lg:block">
            <div className="rounded-xl border border-slate-800 bg-surface-0/80 p-3.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-medium text-slate-300">
                  <Zap className="h-3 w-3 text-indigo-400" />
                  Token Quota
                </span>
                <span className="font-mono text-slate-400">
                  {activeWorkspace.percent_used}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    activeWorkspace.hard_limit_reached
                      ? "bg-rose-500"
                      : activeWorkspace.soft_limit_reached
                        ? "bg-amber-400"
                        : "bg-indigo-500"
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-400">
                <span>{formatTokens(activeWorkspace.total_tokens)} used</span>
                <span>{formatTokens(activeWorkspace.token_quota)}</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-surface-1/60 px-6 py-4 backdrop-blur">
          <div>
            <h1 className="text-base font-semibold text-white">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="text-xs text-slate-400">
              {activeWorkspace
                ? `${activeWorkspace.name} · ${activeWorkspace.plan_name} Tier · ${activeWorkspace.region}`
                : "Loading tenant telemetry..."}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-surface-0 px-3 py-1 font-mono text-[11px] text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {backendMode === "fastapi" ? "FastAPI Gateway" : "In-App Engine"}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-surface-2 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </header>

        {/* Active View */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-6">
          {loading && !usage ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border border-slate-800/80 bg-surface-1"
                />
              ))}
            </div>
          ) : usage && activeWorkspace ? (
            <>
              {activeTab === "analytics" && (
                <UsageView
                  usage={usage}
                  onNavigateBilling={() => setActiveTab("billing")}
                  onNavigatePlayground={() => setActiveTab("playground")}
                />
              )}
              {activeTab === "playground" && (
                <PlaygroundView
                  workspace={activeWorkspace}
                  models={models}
                  onUsageUpdated={handleRefresh}
                  onNavigateBilling={() => setActiveTab("billing")}
                />
              )}
              {activeTab === "api-keys" && (
                <ApiKeysView
                  workspace={activeWorkspace}
                  apiKeys={apiKeys}
                  onRefresh={handleRefresh}
                />
              )}
              {activeTab === "billing" && (
                <BillingView
                  workspace={activeWorkspace}
                  plans={plans.length ? plans : usage.plans}
                  invoices={usage.invoices}
                  onRefresh={handleRefresh}
                />
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
