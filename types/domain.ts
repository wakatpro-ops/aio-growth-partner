export type IndustryTypeKey = "general_store" | "auto_repair";

export type ModuleKey =
  | "store_profile"
  | "multi_store"
  | "ai_post_generation"
  | "ai_review_reply"
  | "aio_diagnosis"
  | "instagram_post"
  | "repair_services"
  | "product_management"
  | "inventory_management"
  | "customer_management"
  | "estimate_management"
  | "invoice_management"
  | "pdf_export"
  | "monthly_report"
  | "marketing_drafts"
  | "instagram_draft_generation"
  | "google_business_profile_draft"
  | "ai_monthly_recommendations"
  | "image_caption_generation"
  | "demand_alerts"
  | "admin"
  | "billing"
  | "accounting";

export type RoleKey =
  | "platform_admin"
  | "org_owner"
  | "store_manager"
  | "staff"
  | "viewer";

export type FeatureFlags = Record<string, boolean>;

export type IndustryConfig = {
  key: IndustryTypeKey;
  name: string;
  dashboardTitle: string;
  profileLabel: string;
  postLabel: string;
  reviewLabel: string;
  diagnosisLabel: string;
  businessLabels: {
    item: string;
    product: string;
    part: string;
    service: string;
    stock: string;
    customer: string;
    estimate: string;
    invoice: string;
    vehicle?: string;
  };
  defaultFeatureFlags: FeatureFlags;
  dashboardCards: string[];
  profileFields: Array<{
    key: string;
    label: string;
    type: "text" | "textarea" | "boolean" | "list";
    placeholder?: string;
  }>;
};

export type Store = {
  id: string;
  organization_id: string;
  industry_type_key: IndustryTypeKey;
  name: string;
  address: string;
  phone: string;
  website_url?: string;
  google_business_url?: string;
  description?: string;
  profile_data: Record<string, unknown>;
  feature_flags: FeatureFlags;
  status: "active" | "inactive";
};

export type AiTemplateKey =
  | "post_generation"
  | "review_reply"
  | "aio_diagnosis"
  | "instagram_draft_generation"
  | "google_business_profile_draft"
  | "ai_monthly_recommendations";

export type AiLogRecord = {
  user_id: string | null;
  organization_id: string | null;
  store_id: string | null;
  template_id: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | string | null;
  model: string;
  tokens: Record<string, unknown> | null;
  status: "success" | "error";
  error_message: string | null;
  created_at?: string;
};
