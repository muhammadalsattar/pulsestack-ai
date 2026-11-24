"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import type { ApiKeyRecord, WorkspaceSummary } from "@/lib/types";

interface ApiKeysViewProps {
  workspace: WorkspaceSummary;
  apiKeys: ApiKeyRecord[];
  onRefresh: () => Promise<void>;
}

const AVAILABLE_SCOPES = [
  { id: "chat:write", label: "chat:write", desc: "Stream completions" },
  { id: "usage:read", label: "usage:read", desc: "Read token & cost metrics" },
  { id: "billing:read", label: "billing:read", desc: "Read plans & invoices" },
];

export function ApiKeysView({
  workspace,
  apiKeys,
  onRefresh,
}: ApiKeysViewProps) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["chat:write", "usage:read"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function toggleScope(scopeId: string) {
    setScopes((prev) =>
      prev.includes(scopeId)
        ? prev.length > 1
          ? prev.filter((s) => s !== scopeId)
          : prev
        : [...prev, scopeId]
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setError(null);
    setCreating(true);
    try {
      const resp = await fetch(`/api/workspaces/${workspace.id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        setError(body.detail ?? "Failed to create API key");
        return;
      }
      setRevealedSecret(body.data.secret_key);
      setName("");
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    setRevokingId(keyId);
    setError(null);
    try {
      const resp = await fetch(
        `/api/workspaces/${workspace.id}/api-keys/${keyId}`,
        { method: "DELETE" }
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        setError(body.detail ?? "Failed to revoke key");
        return;
      }
      await onRefresh();
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopySecret() {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(revealedSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* One-time Secret Reveal Banner */}
      {revealedSecret && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-200">
                  API Key Created — Copy Your Secret Now
                </h4>
                <p className="mt-0.5 text-xs text-emerald-200/80">
                  For security, this secret is shown only once and cannot be
                  recovered after you dismiss this banner.
                </p>
              </div>
            </div>
            <button
              onClick={() => setRevealedSecret(null)}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
            >
              Done
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 overflow-x-auto rounded-lg border border-emerald-500/30 bg-surface-0 px-3.5 py-2.5 font-mono text-xs text-emerald-300">
              {revealedSecret}
            </code>
            <button
              onClick={handleCopySecret}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              {copiedSecret ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Key
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Create Key Form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-slate-800/80 bg-surface-1 p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Create Scoped API Key
            </h3>
            <p className="text-xs text-slate-400">
              Keys are scoped to{" "}
              <strong className="text-slate-200">{workspace.name}</strong> and
              prefixed with <code className="font-mono">ps_live_</code>
            </p>
          </div>
          <KeyRound className="h-4 w-4 text-indigo-400" />
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <label className="text-xs font-medium text-slate-400">
              Key Label
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Backend Worker"
              className="mt-1.5 w-full rounded-lg border border-slate-800 bg-surface-0 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-5">
            <label className="text-xs font-medium text-slate-400">Scopes</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {AVAILABLE_SCOPES.map((s) => {
                const active = scopes.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleScope(s.id)}
                    title={s.desc}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition ${
                      active
                        ? "border-indigo-500/70 bg-indigo-500/15 text-indigo-200"
                        : "border-slate-800 bg-surface-0 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-end lg:col-span-2">
            <button
              type="submit"
              disabled={creating || name.trim().length < 2}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating..." : "Create Key"}
            </button>
          </div>
        </div>
      </form>

      {/* Keys Table */}
      <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-surface-1">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Workspace API Keys
            </h3>
            <p className="text-xs text-slate-400">
              {workspace.active_api_keys} active · {apiKeys.length} total keys
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800/80 bg-surface-0/60 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key Prefix</th>
                <th className="px-4 py-3 font-medium">Scopes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-5 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {apiKeys.map((k) => (
                <tr
                  key={k.id}
                  className={`transition hover:bg-surface-2/40 ${
                    k.status === "revoked" ? "opacity-55" : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-slate-100">
                    {k.name}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-slate-300">
                    {k.prefix}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded border border-slate-700/80 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {k.status === "active" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                        Revoked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-slate-400">
                    {formatRelativeTime(k.last_used_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {k.status === "active" ? (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        disabled={revokingId === k.id}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        {revokingId === k.id ? "Revoking..." : "Revoke"}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        Revoked
                      </span>
                    )}
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
