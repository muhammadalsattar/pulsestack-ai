import crypto from "crypto";
import type {
  ApiKeyRecord,
  DailyUsagePoint,
  InvoiceRecord,
  ModelConfig,
  ModelId,
  ModelSplitItem,
  PlanConfig,
  PlanId,
  RequestTelemetry,
  UsageResponseData,
  WorkspaceSummary,
} from "./types";

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price_monthly_usd: 0,
    token_quota: 100_000,
    max_api_keys: 2,
    rpm_limit: 20,
    features: [
      "100K monthly tokens",
      "Up to 2 scoped API keys",
      "14-day usage analytics",
      "Community support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price_monthly_usd: 49,
    token_quota: 2_500_000,
    max_api_keys: 15,
    rpm_limit: 120,
    features: [
      "2.5M monthly tokens",
      "Up to 15 scoped API keys",
      "Real-time cost metering & alerts",
      "Priority SSE gateway routing",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price_monthly_usd: 249,
    token_quota: 15_000_000,
    max_api_keys: 100,
    rpm_limit: 600,
    features: [
      "15M monthly tokens",
      "Unlimited team workspaces & RBAC",
      "Dedicated rate limits & SLA",
      "Custom model endpoints & audit logs",
    ],
  },
};

export const MODELS: Record<ModelId, ModelConfig> = {
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    provider: "OpenAI",
    input_per_1m_usd: 0.15,
    output_per_1m_usd: 0.6,
    context_window: 128_000,
  },
  "claude-3.5-sonnet": {
    id: "claude-3.5-sonnet",
    provider: "Anthropic",
    input_per_1m_usd: 3.0,
    output_per_1m_usd: 15.0,
    context_window: 200_000,
  },
  "llama-3.1-70b-local": {
    id: "llama-3.1-70b-local",
    provider: "Self-Hosted vLLM",
    input_per_1m_usd: 0.08,
    output_per_1m_usd: 0.24,
    context_window: 131_072,
  },
};

interface ModelBucket {
  tokens: number;
  cost_usd: number;
  requests: number;
}

export interface WorkspaceState {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  members_count: number;
  region: string;
  created_at: string;
  daily_usage: DailyUsagePoint[];
  model_usage: Record<ModelId, ModelBucket>;
  recent_requests: RequestTelemetry[];
  api_keys: ApiKeyRecord[];
  invoices: InvoiceRecord[];
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function generateDailyHistory(
  totalTokensTarget: number,
  avgCostPer1k: number,
  seedOffset: number
): DailyUsagePoint[] {
  const weights = [
    0.72, 0.85, 0.64, 0.91, 1.08, 0.95, 0.78, 1.12, 1.24, 1.05, 0.88, 1.18,
    1.31, 1.09,
  ];
  const rotated = [
    ...weights.slice(seedOffset % weights.length),
    ...weights.slice(0, seedOffset % weights.length),
  ];
  const weightSum = rotated.reduce((a, b) => a + b, 0);

  return Array.from({ length: 14 }, (_, idx) => {
    const tokens = Math.floor(totalTokensTarget * (rotated[idx] / weightSum));
    const requests = Math.max(4, Math.floor(tokens / 1850));
    const cost_usd = Number(((tokens / 1000) * avgCostPer1k).toFixed(4));
    return {
      date: dateDaysAgo(13 - idx),
      tokens,
      cost_usd,
      requests,
    };
  });
}

function createInitialWorkspaces(): Record<string, WorkspaceState> {
  return {
    ws_acme: {
      id: "ws_acme",
      name: "Acme Labs",
      slug: "acme-labs",
      plan: "pro",
      members_count: 8,
      region: "us-east-1",
      created_at: isoDaysAgo(94),
      daily_usage: generateDailyHistory(1_710_000, 0.00145, 0),
      model_usage: {
        "gpt-4o-mini": { tokens: 985_000, cost_usd: 0.412, requests: 562 },
        "claude-3.5-sonnet": {
          tokens: 415_000,
          cost_usd: 3.845,
          requests: 198,
        },
        "llama-3.1-70b-local": {
          tokens: 310_000,
          cost_usd: 0.056,
          requests: 164,
        },
      },
      recent_requests: [
        {
          request_id: "req_9a81f2c301ab",
          timestamp: isoMinutesAgo(6),
          model: "claude-3.5-sonnet",
          prompt_tokens: 482,
          completion_tokens: 319,
          total_tokens: 801,
          cost_usd: 0.006231,
          latency_ms: 842,
          status: 200,
        },
        {
          request_id: "req_7c14e9d842fe",
          timestamp: isoMinutesAgo(21),
          model: "gpt-4o-mini",
          prompt_tokens: 310,
          completion_tokens: 244,
          total_tokens: 554,
          cost_usd: 0.000193,
          latency_ms: 418,
          status: 200,
        },
        {
          request_id: "req_4b09d1a773cd",
          timestamp: isoMinutesAgo(54),
          model: "llama-3.1-70b-local",
          prompt_tokens: 620,
          completion_tokens: 412,
          total_tokens: 1032,
          cost_usd: 0.000148,
          latency_ms: 612,
          status: 200,
        },
      ],
      api_keys: [
        {
          id: "key_acme_prod_01",
          name: "Production Gateway",
          prefix: "ps_live_9f2a...c841",
          scopes: ["chat:write", "usage:read"],
          status: "active",
          created_at: isoDaysAgo(45),
          last_used_at: isoMinutesAgo(6),
        },
        {
          id: "key_acme_ci_02",
          name: "Staging Eval Runner",
          prefix: "ps_live_3d8e...19b0",
          scopes: ["chat:write"],
          status: "active",
          created_at: isoDaysAgo(19),
          last_used_at: isoMinutesAgo(185),
        },
      ],
      invoices: [
        {
          id: "inv_2026_11_acme",
          date: dateDaysAgo(12),
          plan: "Pro",
          amount_usd: 49,
          status: "paid",
        },
        {
          id: "inv_2026_10_acme",
          date: dateDaysAgo(42),
          plan: "Pro",
          amount_usd: 49,
          status: "paid",
        },
      ],
    },
    ws_orbit: {
      id: "ws_orbit",
      name: "Orbit Health",
      slug: "orbit-health",
      plan: "enterprise",
      members_count: 34,
      region: "eu-central-1",
      created_at: isoDaysAgo(180),
      daily_usage: generateDailyHistory(6_180_000, 0.0029, 3),
      model_usage: {
        "gpt-4o-mini": { tokens: 2_420_000, cost_usd: 0.968, requests: 1410 },
        "claude-3.5-sonnet": {
          tokens: 2_610_000,
          cost_usd: 24.31,
          requests: 1120,
        },
        "llama-3.1-70b-local": {
          tokens: 1_150_000,
          cost_usd: 0.214,
          requests: 680,
        },
      },
      recent_requests: [
        {
          request_id: "req_e310a5f981bc",
          timestamp: isoMinutesAgo(3),
          model: "claude-3.5-sonnet",
          prompt_tokens: 1120,
          completion_tokens: 640,
          total_tokens: 1760,
          cost_usd: 0.01296,
          latency_ms: 965,
          status: 200,
        },
        {
          request_id: "req_a129c7b044de",
          timestamp: isoMinutesAgo(14),
          model: "llama-3.1-70b-local",
          prompt_tokens: 890,
          completion_tokens: 510,
          total_tokens: 1400,
          cost_usd: 0.000194,
          latency_ms: 530,
          status: 200,
        },
      ],
      api_keys: [
        {
          id: "key_orbit_core_01",
          name: "Clinical Triage Pipeline",
          prefix: "ps_live_71ab...04fe",
          scopes: ["chat:write", "usage:read", "billing:read"],
          status: "active",
          created_at: isoDaysAgo(110),
          last_used_at: isoMinutesAgo(3),
        },
        {
          id: "key_orbit_audit_02",
          name: "Compliance Telemetry Exporter",
          prefix: "ps_live_50cd...88a2",
          scopes: ["usage:read"],
          status: "active",
          created_at: isoDaysAgo(62),
          last_used_at: isoMinutesAgo(47),
        },
      ],
      invoices: [
        {
          id: "inv_2026_11_orbit",
          date: dateDaysAgo(8),
          plan: "Enterprise",
          amount_usd: 249,
          status: "paid",
        },
        {
          id: "inv_2026_10_orbit",
          date: dateDaysAgo(38),
          plan: "Enterprise",
          amount_usd: 249,
          status: "paid",
        },
      ],
    },
    ws_solo: {
      id: "ws_solo",
      name: "Solo Dev",
      slug: "solo-dev",
      plan: "free",
      members_count: 1,
      region: "us-west-2",
      created_at: isoDaysAgo(22),
      daily_usage: generateDailyHistory(86_400, 0.00055, 7),
      model_usage: {
        "gpt-4o-mini": { tokens: 62_400, cost_usd: 0.024, requests: 48 },
        "claude-3.5-sonnet": { tokens: 9_000, cost_usd: 0.081, requests: 7 },
        "llama-3.1-70b-local": { tokens: 15_000, cost_usd: 0.003, requests: 14 },
      },
      recent_requests: [
        {
          request_id: "req_1f88b3e290aa",
          timestamp: isoMinutesAgo(38),
          model: "gpt-4o-mini",
          prompt_tokens: 240,
          completion_tokens: 190,
          total_tokens: 430,
          cost_usd: 0.00015,
          latency_ms: 385,
          status: 200,
        },
      ],
      api_keys: [
        {
          id: "key_solo_dev_01",
          name: "Local Prototype Key",
          prefix: "ps_live_14ef...77c9",
          scopes: ["chat:write", "usage:read"],
          status: "active",
          created_at: isoDaysAgo(18),
          last_used_at: isoMinutesAgo(38),
        },
      ],
      invoices: [
        {
          id: "inv_2026_11_solo",
          date: dateDaysAgo(22),
          plan: "Free",
          amount_usd: 0,
          status: "paid",
        },
      ],
    },
  };
}

const globalForStore = globalThis as unknown as {
  __pulsestackWorkspaces?: Record<string, WorkspaceState>;
};

export function getStore(): Record<string, WorkspaceState> {
  if (!globalForStore.__pulsestackWorkspaces) {
    globalForStore.__pulsestackWorkspaces = createInitialWorkspaces();
  }
  return globalForStore.__pulsestackWorkspaces;
}

export function makeRequestId(): string {
  return `req_${crypto.randomBytes(6).toString("hex")}`;
}

export function envelope<T>(data: T, requestId?: string) {
  return {
    request_id: requestId ?? makeRequestId(),
    timestamp: new Date().toISOString(),
    data,
  };
}

export function estimateCostUsd(
  model: ModelId,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODELS[model] ?? MODELS["gpt-4o-mini"];
  const cost =
    (promptTokens / 1_000_000) * pricing.input_per_1m_usd +
    (completionTokens / 1_000_000) * pricing.output_per_1m_usd;
  return Number(cost.toFixed(6));
}

export function serializeWorkspace(ws: WorkspaceState): WorkspaceSummary {
  const plan = PLANS[ws.plan];
  const buckets = Object.values(ws.model_usage);
  const total_tokens = buckets.reduce((acc, b) => acc + b.tokens, 0);
  const total_cost_usd = Number(
    buckets.reduce((acc, b) => acc + b.cost_usd, 0).toFixed(4)
  );
  const total_requests = buckets.reduce((acc, b) => acc + b.requests, 0);
  const percent_used = Number(
    ((total_tokens / plan.token_quota) * 100).toFixed(1)
  );
  const active_api_keys = ws.api_keys.filter((k) => k.status === "active").length;
  const avg_latency_ms =
    ws.recent_requests.length > 0
      ? Math.round(
          ws.recent_requests.reduce((acc, r) => acc + r.latency_ms, 0) /
            ws.recent_requests.length
        )
      : 420;

  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    plan: ws.plan,
    plan_name: plan.name,
    price_monthly_usd: plan.price_monthly_usd,
    members_count: ws.members_count,
    region: ws.region,
    created_at: ws.created_at,
    total_tokens,
    total_cost_usd,
    total_requests,
    token_quota: plan.token_quota,
    percent_used,
    soft_limit_reached: percent_used >= 80,
    hard_limit_reached: total_tokens >= plan.token_quota,
    active_api_keys,
    avg_latency_ms,
  };
}

export function getWorkspaceUsage(ws: WorkspaceState): UsageResponseData {
  const summary = serializeWorkspace(ws);
  const denom = Math.max(1, summary.total_tokens);
  const model_split: ModelSplitItem[] = (
    Object.entries(ws.model_usage) as [ModelId, ModelBucket][]
  )
    .map(([model, stats]) => ({
      model,
      provider: MODELS[model]?.provider ?? "Custom",
      tokens: stats.tokens,
      cost_usd: Number(stats.cost_usd.toFixed(4)),
      requests: stats.requests,
      share_pct: Number(((stats.tokens / denom) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    workspace: summary,
    daily_usage: ws.daily_usage,
    model_split,
    recent_requests: ws.recent_requests,
    invoices: ws.invoices,
    plans: Object.values(PLANS),
  };
}

export function recordWorkspaceUsage(
  ws: WorkspaceState,
  entry: Omit<RequestTelemetry, "total_tokens" | "cost_usd" | "timestamp">
): RequestTelemetry {
  const total_tokens = entry.prompt_tokens + entry.completion_tokens;
  const cost_usd = estimateCostUsd(
    entry.model,
    entry.prompt_tokens,
    entry.completion_tokens
  );
  const record: RequestTelemetry = {
    ...entry,
    timestamp: new Date().toISOString(),
    total_tokens,
    cost_usd,
  };

  ws.recent_requests = [record, ...ws.recent_requests].slice(0, 30);

  const bucket = ws.model_usage[entry.model];
  if (bucket) {
    bucket.tokens += total_tokens;
    bucket.cost_usd = Number((bucket.cost_usd + cost_usd).toFixed(6));
    bucket.requests += 1;
  }

  const today = dateDaysAgo(0);
  const last = ws.daily_usage[ws.daily_usage.length - 1];
  if (last && last.date === today) {
    last.tokens += total_tokens;
    last.cost_usd = Number((last.cost_usd + cost_usd).toFixed(6));
    last.requests += 1;
  } else {
    ws.daily_usage = [
      ...ws.daily_usage.slice(-13),
      { date: today, tokens: total_tokens, cost_usd, requests: 1 },
    ];
  }

  return record;
}

export function applyWorkspacePlan(
  ws: WorkspaceState,
  targetPlan: PlanId
): InvoiceRecord {
  const cfg = PLANS[targetPlan];
  ws.plan = targetPlan;
  const invoice: InvoiceRecord = {
    id: `inv_${dateDaysAgo(0).slice(0, 7).replace("-", "_")}_${crypto
      .randomBytes(3)
      .toString("hex")}`,
    date: dateDaysAgo(0),
    plan: cfg.name,
    amount_usd: cfg.price_monthly_usd,
    status: "paid",
  };
  ws.invoices = [invoice, ...ws.invoices];
  return invoice;
}

export function buildDeterministicReply(
  ws: WorkspaceState,
  model: ModelId,
  prompt: string,
  temperature: number
): string {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  if (
    lower.includes("sql") ||
    lower.includes("postgres") ||
    lower.includes("schema") ||
    lower.includes("database")
  ) {
    return (
      `### Multi-Tenant Metering Schema (${model})\n\n` +
      `For **${ws.name}** (\`${ws.plan.toUpperCase()}\` tier), partition usage events by \`workspace_id\` and \`created_at\` so tenant billing rollups stay under 10ms:\n\n` +
      "```sql\n" +
      "CREATE TABLE token_usage_events (\n" +
      "  request_id TEXT PRIMARY KEY,\n" +
      "  workspace_id TEXT NOT NULL,\n" +
      "  model TEXT NOT NULL,\n" +
      "  prompt_tokens INT NOT NULL,\n" +
      "  completion_tokens INT NOT NULL,\n" +
      "  cost_usd NUMERIC(10, 6) NOT NULL,\n" +
      "  created_at TIMESTAMPTZ DEFAULT NOW()\n" +
      ");\n" +
      "CREATE INDEX idx_usage_ws_date ON token_usage_events (workspace_id, created_at DESC);\n" +
      "```\n\n" +
      "Pair this with a per-workspace Redis token counter to enforce soft (80%) and hard (100%) quotas before dispatching upstream inference."
    );
  }

  if (
    lower.includes("stripe") ||
    lower.includes("billing") ||
    lower.includes("webhook") ||
    lower.includes("subscription")
  ) {
    return (
      `### Stripe Subscription & Quota Sync (${model})\n\n` +
      `Workspace **${ws.name}** is currently active on the **${PLANS[ws.plan].name}** plan.\n\n` +
      "Production billing lifecycle:\n" +
      "1. Create a Checkout Session carrying `metadata.workspace_id` and `metadata.target_plan`.\n" +
      "2. Validate `Stripe-Signature` on `/api/v1/webhooks/stripe` against the raw request payload.\n" +
      "3. On `checkout.session.completed`, atomically upgrade the tenant plan, raise the monthly token ceiling, and record the invoice with idempotency.\n" +
      "4. Surface soft-limit banners at 80% usage and gate requests with HTTP `429` at 100%."
    );
  }

  return (
    `### PulseStack Gateway Response (\`${model}\` · temp \`${temperature.toFixed(1)}\`)\n\n` +
    `Executed inside tenant namespace **${ws.name}** (\`${ws.region}\`).\n\n` +
    `**Prompt:** ${clean.slice(0, 180)}\n\n` +
    "**Gateway telemetry & guarantees:**\n" +
    `- Multi-tenant isolation enforced for \`${ws.id}\` with real-time token & USD metering.\n` +
    "- Tokens streamed over Server-Sent Events (SSE) with end-to-end `X-Request-ID` tracing.\n" +
    "- Workspace usage charts, model split bars, and quota guardrails update immediately upon completion."
  );
}

export function getFastApiUrl(): string | null {
  const url = process.env.FASTAPI_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}
