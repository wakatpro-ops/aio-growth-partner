export type GrowthActionStatus = "todo" | "drafted" | "pending_approval" | "approved" | "rejected" | "done" | "paused";
export type GrowthApprovalStatus = "pending" | "approved" | "rejected";

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
  external_account_id?: string | null;
  external_post_id?: string | null;
  external_status: string | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  failed_reason?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  drafts?: GrowthActionDraft[];
  schedule_items?: GrowthActionScheduleItem[];
  approvals?: GrowthActionApproval[];
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
  external_account_id?: string | null;
  external_post_id?: string | null;
  external_status: string | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  failed_reason?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GrowthActionScheduleItem = {
  id: string;
  organization_id: string;
  store_id: string;
  growth_action_id: string;
  growth_action_draft_id: string | null;
  channel: GrowthActionChannel;
  title: string;
  scheduled_date: string;
  scheduled_at: string | null;
  status: GrowthActionStatus;
  external_provider: string | null;
  external_account_id: string | null;
  external_post_id: string | null;
  external_status: string | null;
  published_at: string | null;
  failed_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GrowthActionApproval = {
  id: string;
  organization_id: string;
  store_id: string;
  growth_action_id: string;
  growth_action_draft_id: string | null;
  status: GrowthApprovalStatus;
  comment: string | null;
  requested_by: string | null;
  approved_by: string | null;
  requested_at: string;
  decided_at: string | null;
  created_at: string;
};

export type GrowthActionDraftVersion = {
  id: string;
  organization_id: string;
  store_id: string;
  growth_action_id: string;
  growth_action_draft_id: string;
  version_number: number;
  title: string;
  body: string;
  short_body: string | null;
  hashtags: string[];
  call_to_action: string | null;
  memo: string | null;
  edited_by: string | null;
  created_at: string;
};

export type ExternalChannelAccount = {
  id: string;
  organization_id: string;
  store_id: string;
  channel: GrowthActionChannel;
  external_provider: string;
  external_account_id: string | null;
  account_name: string;
  connection_status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoogleOAuthConnection = {
  id: string;
  organization_id: string;
  store_id: string;
  provider_user_id: string | null;
  email: string | null;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
  expires_at: string | null;
  scopes: string[];
  status: "not_connected" | "connected" | "expired" | "error" | "disconnected";
  connected_at: string | null;
  disconnected_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoogleBusinessProfileSetting = {
  id: string;
  organization_id: string;
  store_id: string;
  google_account_id: string | null;
  location_id: string | null;
  location_name: string | null;
  address: string | null;
  status: string;
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoogleGmailSetting = {
  id: string;
  organization_id: string;
  store_id: string;
  email: string | null;
  sender_name: string | null;
  signature: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoogleCalendarSetting = {
  id: string;
  organization_id: string;
  store_id: string;
  calendar_id: string | null;
  calendar_name: string | null;
  timezone: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExternalPublishJob = {
  id: string;
  organization_id: string;
  store_id: string;
  growth_action_id: string | null;
  channel: string;
  provider: string;
  target_id: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  payload_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExternalIntegrationLog = {
  id: string;
  organization_id: string;
  store_id: string;
  provider: string;
  action_type: string;
  status: string;
  message: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};
