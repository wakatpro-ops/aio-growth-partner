export type StoreEmailCategory =
  | "reservation"
  | "inquiry"
  | "complaint"
  | "review"
  | "invoice_receipt"
  | "purchasing"
  | "inventory_shipping"
  | "platform_notice"
  | "advertising"
  | "sensitive"
  | "unknown";

export type StoreEmailProcessingStatus =
  | "review_required"
  | "ready_to_apply"
  | "applied"
  | "ignored"
  | "rejected"
  | "error";

export type BookingEmailEventType = "created" | "changed" | "cancelled";

export type StoreAiEmailTemplate = {
  id: string;
  organization_id: string;
  store_id: string;
  sender_email: string;
  sender_domain: string;
  provider_key: string;
  event_type: BookingEmailEventType;
  template_fingerprint: string;
  status: "active" | "paused";
  approved_message_id: string | null;
  match_count: number;
  auto_processed_count: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
};

export type StoreAiInbox = {
  id: string;
  organization_id: string;
  store_id: string;
  email_address: string;
  status: "active" | "paused";
  auto_apply_reservations: boolean;
  trusted_senders: string[];
  last_received_at: string | null;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
};

export type StoreAiEmailMessage = {
  id: string;
  inbox_id: string;
  organization_id: string;
  store_id: string;
  sender_name: string | null;
  sender_email: string | null;
  sender_domain: string | null;
  subject: string;
  summary: string;
  category: StoreEmailCategory;
  classification_confidence: number;
  classification_reason: string | null;
  processing_status: StoreEmailProcessingStatus;
  requires_human_confirmation: boolean;
  sensitive: boolean;
  known_template: boolean;
  booking_event_type: BookingEmailEventType | null;
  booking_provider: string | null;
  template_fingerprint: string | null;
  matched_template_id: string | null;
  extracted_data: Record<string, unknown>;
  applied_target_type: string | null;
  applied_target_id: string | null;
  received_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};
