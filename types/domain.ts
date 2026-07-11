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
  | "data_imports"
  | "csv_import"
  | "excel_import"
  | "column_mapping"
  | "sales_normalization"
  | "sales_reports"
  | "sales_ai_report"
  | "sales_anomaly_detection"
  | "demand_forecast"
  | "inventory_alerts"
  | "recommended_actions"
  | "growth_action_center"
  | "google_business_profile_drafts"
  | "instagram_drafts"
  | "review_reply_drafts"
  | "customer_message_drafts"
  | "pop_copy_drafts"
  | "line_message_drafts"
  | "growth_calendar"
  | "draft_approval_flow"
  | "draft_editing"
  | "channel_previews"
  | "external_channel_accounts"
  | "google_integrations"
  | "google_oauth_connection"
  | "google_business_profile_integration"
  | "gmail_draft_integration"
  | "google_calendar_integration"
  | "external_publish_jobs"
  | "google_sheets_import"
  | "pos_api_integrations"
  | "sales_export"
  | "sales_report_pdf"
  | "ai_sales_insights"
  | "invoice_compliance"
  | "invoice_numbering"
  | "tax_rate_breakdown"
  | "order_workflow"
  | "order_management"
  | "payment_management"
  | "accounting_csv_export"
  | "accounting_export"
  | "pdf_issue_logs"
  | "audit_logs"
  | "audit_log"
  | "subsidy_impact_report"
  | "invoice_tool_map"
  | "future_accounting_integrations"
  | "platform_billing"
  | "store_stripe_connect"
  | "store_accounting_integration"
  | "accounting_export_jobs"
  | "store_integrations"
  | "manual_stripe_payment_links"
  | "freee_csv_export"
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
  source_application_id?: string | null;
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
  | "ai_monthly_recommendations"
  | "data_column_mapping_suggestion"
  | "sales_monthly_commentary"
  | "sales_ai_monthly_report"
  | "demand_action_recommendations"
  | "growth_action_draft_generation"
  | "google_send_preparation";

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
