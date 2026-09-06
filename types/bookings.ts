import type { Customer } from "@/types/phase2";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type BookingSource = "aio_boost" | "manual" | "phone" | "line" | "external";
export type BookingResourceType = "staff" | "seat" | "room" | "equipment" | "table" | "vehicle" | "other";

export type BookingService = {
  id: string;
  organization_id: string;
  store_id: string;
  item_id: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  price: number;
  color: string;
  is_bookable: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type BookingResource = {
  id: string;
  organization_id: string;
  store_id: string;
  membership_id: string | null;
  resource_type: BookingResourceType;
  name: string;
  capacity: number;
  color: string;
  is_bookable: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingAllocation = {
  id: string;
  booking_id: string;
  resource_id: string;
  resource?: Pick<BookingResource, "id" | "name" | "resource_type" | "color"> | null;
};

export type StoreBooking = {
  id: string;
  organization_id: string;
  store_id: string;
  customer_id: string | null;
  service_id: string | null;
  status: BookingStatus;
  source: BookingSource;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  service_name: string | null;
  notes: string | null;
  external_provider: string | null;
  external_booking_id: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: Pick<Customer, "id" | "name" | "phone" | "email"> | null;
  service?: Pick<BookingService, "id" | "name" | "duration_minutes" | "color"> | null;
  allocations?: BookingAllocation[];
};
