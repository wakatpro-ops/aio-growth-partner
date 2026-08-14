export type CustomerNote = {
  id: string;
  organization_id: string;
  store_id: string;
  customer_id: string;
  body: string;
  follow_up: string | null;
  visibility: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type CustomerImportJob = {
  id: string;
  organization_id: string;
  store_id: string;
  original_filename: string;
  file_type: string;
  status: "preview" | "processing" | "completed" | "failed";
  source_headers: string[];
  mapping: Record<string, string>;
  preview_rows: Array<Record<string, unknown>>;
  raw_rows: Array<Record<string, unknown>>;
  row_count: number;
  success_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{ row: number; message: string }>;
  duplicate_behavior: "skip" | "update";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CustomerMessageDraft = {
  id: string;
  organization_id: string;
  store_id: string;
  customer_id: string | null;
  segment_key: string;
  channel: string;
  goal: string | null;
  title: string;
  body: string;
  audience_count: number;
  scheduled_at: string | null;
  status: "draft" | "scheduled";
  ai_reasoning: string | null;
  created_at: string;
  updated_at: string;
  customer?: { name: string } | null;
};

export type CustomerSegmentSummary = {
  key: string;
  label: string;
  description: string;
  count: number;
  recommendedAction: string;
};
