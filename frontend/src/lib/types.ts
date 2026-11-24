export type PlanId = "free" | "pro" | "enterprise";

export type ModelId =
  | "gpt-4o-mini"
  | "claude-3.5-sonnet"
  | "llama-3.1-70b-local";

export interface PlanConfig {
  id: PlanId;
  name: string;
  price_monthly_usd: number;
  token_quota: number;
  max_api_keys: number;
  rpm_limit: number;
  features: string[];
}

export interface ModelConfig {
  id: ModelId;
  provider: string;
  input_per_1m_usd: number;
  output_per_1m_usd: number;
  context_window: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  plan_name: string;
  price_monthly_usd: number;
  members_count: number;
  region: string;
  created_at: string;
  total_tokens: number;
  total_cost_usd: number;
  total_requests: number;
  token_quota: number;
  percent_used: number;
  soft_limit_reached: boolean;
  hard_limit_reached: boolean;
  active_api_keys: number;
  avg_latency_ms: number;
}

export interface DailyUsagePoint {
  date: string;
  tokens: number;
  cost_usd: number;
  requests: number;
}

export interface ModelSplitItem {
  model: ModelId;
  provider: string;
  tokens: number;
  cost_usd: number;
  requests: number;
  share_pct: number;
}

export interface RequestTelemetry {
  request_id: string;
  timestamp: string;
  model: ModelId;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string;
}

export interface InvoiceRecord {
  id: string;
  date: string;
  plan: string;
  amount_usd: number;
  status: "paid" | "open";
}

export interface UsageResponseData {
  workspace: WorkspaceSummary;
  daily_usage: DailyUsagePoint[];
  model_split: ModelSplitItem[];
  recent_requests: RequestTelemetry[];
  invoices: InvoiceRecord[];
  plans: PlanConfig[];
}

export interface ApiEnvelope<T> {
  request_id: string;
  timestamp: string;
  data: T;
}
