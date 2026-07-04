export type GrowthActionStatus = "todo" | "drafted" | "done" | "paused";

export type GrowthActionChannel =
  | "google_business_profile"
  | "instagram"
  | "review_reply"
  | "customer_message"
  | "store_pop"
  | "line"
  | "other";

export type GrowthAction = {
  id: string;
  organization_id: string;
  store_id: string;
  industry_type_key: string;
  title: string;
  summary: string;
  priority: "low" | "medium" | "high";
  reason: string;
  recommended_date: string | null;
  target_channel: GrowthActionChannel;
  status: GrowthActionStatus;
  source_type: string | null;
  source_id: string | null;
  external_provider: string | null;
  external_status: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  drafts?: GrowthActionDraft[];
};

export type GrowthActionDraft = {
  id: string;
  organization_id: string;
  store_id: string;
  growth_action_id: string;
  channel: GrowthActionChannel;
  title: string;
  body: string;
  short_body: string | null;
  hashtags: string[];
  call_to_action: string | null;
  copy_variant: string;
  external_provider: string | null;
  external_status: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
