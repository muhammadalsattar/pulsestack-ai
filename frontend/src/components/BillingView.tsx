"use client";

import { useState } from "react";
import {
  Check,
  CreditCard,
  Receipt,
  Sparkles,
  Webhook,
  X,
} from "lucide-react";
import { formatTokens } from "@/lib/format";
import type {
  InvoiceRecord,
  PlanConfig,
  PlanId,
  WorkspaceSummary,
} from "@/lib/types";

interface BillingViewProps {
  workspace: WorkspaceSummary;
  plans: PlanConfig[];
  invoices: InvoiceRecord[];
  onRefresh: () => Promise<void>;
}

interface PendingCheckout {
  session_id: string;
  target_plan: PlanId;
  plan_name: string;
  price_monthly_usd: number;
}

export function BillingView({
  workspace,
  plans,
  invoices,
  onRefresh,
}: BillingViewProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [pendingCheckout, setPendingCheckout] =
    useState<PendingCheckout | null>(null);
  const [completingWebhook, setCompletingWebhook] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleSelectPlan(plan: PlanConfig) {
    if (plan.id === workspace.plan) return;
    setLoadingPlan(plan.id);
    setToast(null);
    try {
      const resp = await fetch(
        `/api/workspaces/${workspace.id}/billing/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_plan: plan.id,
            simulate_immediate: false,
          }),
        }
      );
      const body = await resp.json();
      if (!resp.ok) {
        setToast(body.detail ?? "Checkout session failed");
        return;
      }

      if (body.data.mode === "stripe-live" && body.data.checkout_url) {
        window.location.href = body.data.checkout_url;
        return;
      }

      setPendingCheckout({
        session_id: body.data.session_id,
        target_plan: plan.id,
        plan_name: plan.name,
        price_monthly_usd: plan.price_monthly_usd,
      });
    } finally {
      setLoadingPlan(null);
    }
  }

  async function handleCompleteDemoWebhook() {
    if (!pendingCheckout) return;
    setCompletingWebhook(true);
    try {
      const resp = await fetch("/api/webhooks/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "checkout.session.completed",
          data: {
            object: {
              id: pendingCheckout.session_id,
              metadata: {
                workspace_id: workspace.id,
                target_plan: pendingCheckout.target_plan,
              },
            },
          },
        }),
      });
      if (resp.ok) {
        setToast(
          `Webhook checkout.session.completed processed — ${workspace.name} is now on ${pendingCheckout.plan_name}.`
        );
        setPendingCheckout(null);
        await onRefresh();
      }
    } finally {
      setCompletingWebhook(false);
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            {toast}
          </span>
          <button
            onClick={() => setToast(null)}
            className="text-emerald-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Current Plan Summary */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800/80 bg-surface-1 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
            <CreditCard className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                {workspace.name} — {workspace.plan_name} Plan
              </h3>
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[11px] font-medium text-indigo-300">
                ${workspace.price_monthly_usd}/mo
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Monthly token ceiling: {formatTokens(workspace.token_quota)} ·
              Currently at {workspace.percent_used}% utilization
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-surface-0 px-3 py-1.5 font-mono text-[11px] text-slate-400">
          <Webhook className="h-3.5 w-3.5 text-indigo-400" />
          Stripe Checkout + Webhook Ready
        </span>
      </div>

      {/* Plan Comparison Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === workspace.plan;
          const isUpgrade =
            plan.price_monthly_usd > workspace.price_monthly_usd;
          const isPro = plan.id === "pro";

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-xl border p-6 transition ${
                isCurrent
                  ? "border-indigo-500/70 bg-indigo-500/[0.06]"
                  : "border-slate-800/80 bg-surface-1 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-semibold text-white">
                    {plan.name}
                  </h4>
                  {isCurrent ? (
                    <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                      Current Plan
                    </span>
                  ) : isPro ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                      <Sparkles className="h-3 w-3" />
                      Popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-bold text-white">
                    ${plan.price_monthly_usd}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>

                <p className="mt-2 font-mono text-xs text-indigo-300">
                  {formatTokens(plan.token_quota)} tokens · {plan.rpm_limit} RPM
                </p>

                <ul className="mt-5 space-y-2.5 text-xs text-slate-300">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={isCurrent || loadingPlan === plan.id}
                onClick={() => handleSelectPlan(plan)}
                className={`mt-6 w-full rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                  isCurrent
                    ? "cursor-default border border-slate-800 bg-surface-2 text-slate-500"
                    : isUpgrade
                      ? "bg-indigo-600 text-white hover:bg-indigo-500"
                      : "border border-slate-700 bg-surface-2 text-slate-200 hover:bg-surface-3"
                }`}
              >
                {isCurrent
                  ? "Active Subscription"
                  : loadingPlan === plan.id
                    ? "Creating Session..."
                    : isUpgrade
                      ? `Upgrade to ${plan.name}`
                      : `Switch to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Invoice History */}
      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-surface-1">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-white">
              Invoice History
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800/80 bg-surface-0/60 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Invoice ID</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-2/40">
                  <td className="px-5 py-3 font-mono text-slate-200">
                    {inv.id}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{inv.date}</td>
                  <td className="px-4 py-3 text-slate-200">{inv.plan}</td>
                  <td className="px-4 py-3 font-mono text-slate-200">
                    ${inv.amount_usd.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[11px] capitalize text-emerald-300">
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Demo Stripe Checkout + Webhook Simulator Modal */}
      {pendingCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-surface-1 p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[10px] font-medium text-indigo-300">
                  STRIPE DEMO CHECKOUT
                </span>
                <h4 className="mt-2 text-base font-semibold text-white">
                  Confirm Plan Change to {pendingCheckout.plan_name}
                </h4>
              </div>
              <button
                onClick={() => setPendingCheckout(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-surface-2 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-800 bg-surface-0 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Workspace</span>
                <span className="font-medium text-white">{workspace.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Session ID</span>
                <span className="font-mono text-slate-300">
                  {pendingCheckout.session_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Monthly Total</span>
                <span className="font-mono font-semibold text-emerald-300">
                  ${pendingCheckout.price_monthly_usd}.00 / mo
                </span>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              No live <code className="font-mono">STRIPE_SECRET_KEY</code> is
              configured, so clicking below fires a real{" "}
              <code className="font-mono text-slate-300">
                checkout.session.completed
              </code>{" "}
              webhook event to{" "}
              <code className="font-mono text-slate-300">
                POST /api/webhooks/stripe
              </code>
              .
            </p>

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPendingCheckout(null)}
                className="flex-1 rounded-lg border border-slate-700 bg-surface-2 px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={completingWebhook}
                onClick={handleCompleteDemoWebhook}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {completingWebhook
                  ? "Firing Webhook..."
                  : "Complete & Fire Webhook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
