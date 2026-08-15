export type AioTaskStatus = "not_started" | "in_progress" | "completed" | "on_hold";
export type AioPublicationTarget = "none" | "website" | "google" | "instagram" | "facebook" | "other";
export type AioPublicationStatus = "not_published" | "pending_review" | "verified";

export type AioGoal = {
  id: string;
  organization_id: string;
  store_id: string;
  target_questions: string[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AioImprovementTask = {
  id: string;
  organization_id: string;
  store_id: string;
  source_key: string;
  title: string;
  description: string | null;
  status: AioTaskStatus;
  assignee_name: string | null;
  due_date: string | null;
  source_href: string | null;
  before_score: number | null;
  after_score: number | null;
  before_value: string | null;
  after_value: string | null;
  change_summary: string | null;
  hold_reason: string | null;
  publication_target: AioPublicationTarget;
  publication_status: AioPublicationStatus;
  publication_url: string | null;
  published_at: string | null;
  verified_at: string | null;
  next_review_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type AioReadinessSnapshot = {
  id: string;
  organization_id: string;
  store_id: string;
  score: number;
  trigger_type: "initial" | "manual" | "monthly" | "task_completed";
  readiness_items: Array<Record<string, unknown>>;
  publication_status: Record<string, unknown>;
  target_questions: string[];
  next_action_key: string | null;
  next_action_label: string | null;
  created_at: string;
};

export type AioImprovementAlert = {
  key: string;
  tone: "warning" | "danger" | "info";
  title: string;
  message: string;
  href: string;
};
