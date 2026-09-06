export type LineConversationState =
  | "awaiting_consent"
  | "choosing_service"
  | "choosing_resource"
  | "choosing_time"
  | "choosing_slot"
  | "entering_name"
  | "confirming_booking"
  | "choosing_change_booking"
  | "choosing_cancel_booking"
  | "entering_reschedule_time"
  | "choosing_reschedule_slot"
  | "confirming_reschedule"
  | "confirming_cancel"
  | "idle";

export type LineConversationContext = {
  serviceId?: string;
  serviceName?: string;
  durationMinutes?: number;
  resourceId?: string | null;
  resourceName?: string | null;
  serviceOptions?: Array<{ id: string; name: string; durationMinutes: number }>;
  resourceOptions?: Array<{ id: string; name: string }>;
  slotOptions?: string[];
  startsAt?: string;
  customerName?: string;
  bookingId?: string;
  bookingOptions?: Array<{ id: string; label: string }>;
  mode?: "create" | "reschedule";
};

export type LineWebhookEvent = {
  webhookEventId?: string;
  type?: string;
  replyToken?: string;
  timestamp?: number;
  source?: { type?: string; userId?: string };
  message?: { id?: string; type?: string; text?: string };
};

export type LineWebhookBody = {
  destination?: string;
  events?: LineWebhookEvent[];
};

