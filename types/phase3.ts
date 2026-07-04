import type { IndustryTypeKey } from "@/types/domain";

export type MarketingChannel = "instagram" | "google_business_profile" | "other";
export type MarketingDraftStatus = "draft" | "approved" | "published" | "archived";

export type MarketingDraft = {
  id: string;
  organization_id: string;
  store_id: string;
  industry_type_key: IndustryTypeKey;
  channel: MarketingChannel;
  status: MarketingDraftStatus;
  title: string;
  body: string;
  short_body: string | null;
  hashtags: string[];
  call_to_action: string | null;
  recommended_image_idea: string | null;
  source_type: string | null;
  source_id: string | null;
  ai_reasoning: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AiRecommendation = {
  id: string;
  organization_id: string;
  store_id: string;
  industry_type_key: IndustryTypeKey;
  month: string;
  title: string;
  good_points: string[];
  cautions: string[];
  next_actions: string[];
  posting_themes: string[];
  inventory_suggestions: string[];
  customer_priorities: string[];
  source_report: Record<string, unknown>;
  ai_reasoning: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};
