export type ExternalBookingProviderKey =
  | "minimo"
  | "hotpepper_beauty"
  | "rakuten_beauty"
  | "epark"
  | "ozmall"
  | "ekiten"
  | "reserva"
  | "stores_reservation";

export type ExternalBookingConnectionMode =
  | "official_read_api"
  | "contract_api"
  | "partner_inquiry"
  | "file_import";

export type ExternalBookingConnectionStatus =
  | "preparing"
  | "awaiting_provider"
  | "credentials_required"
  | "connection_test_required"
  | "connected_read_only"
  | "paused"
  | "error";

export type ExternalBookingConnection = {
  id: string;
  organization_id: string;
  store_id: string;
  provider_key: ExternalBookingProviderKey;
  connection_mode: ExternalBookingConnectionMode;
  status: ExternalBookingConnectionStatus;
  external_account_label: string | null;
  external_store_id: string | null;
  contracted_plan: string | null;
  notes: string | null;
  owner_authorized_at: string;
  application_requested_at: string | null;
  credentials_received_at: string | null;
  connection_tested_at: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  sync_enabled: boolean;
  read_only: true;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};
