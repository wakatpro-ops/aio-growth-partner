export type LineMigrationStage =
  | "assessment"
  | "data_preparation"
  | "test"
  | "cutover"
  | "completed"
  | "rolled_back";

export type LineMigrationExportMethod = "api" | "csv" | "manual" | "none" | "unknown";
export type LineMigrationAdminAccess = "confirmed" | "needs_owner" | "unknown";
export type LineMigrationDataStatus = "not_started" | "export_ready" | "manual_ready" | "no_data";

export type LineBookingMigration = {
  id: string;
  organization_id: string;
  store_id: string;
  current_provider_name: string;
  official_account_name: string | null;
  official_account_basic_id: string | null;
  admin_access_status: LineMigrationAdminAccess;
  export_method: LineMigrationExportMethod;
  data_preparation_status: LineMigrationDataStatus;
  import_file_name: string | null;
  import_batch_id: string | null;
  import_row_count: number;
  import_valid_row_count: number;
  imported_booking_count: number;
  open_booking_count: number | null;
  target_cutover_at: string | null;
  rollback_plan: string | null;
  notes: string | null;
  stage: LineMigrationStage;
  data_prepared_at: string | null;
  test_confirmed_at: string | null;
  cutover_requested_at: string | null;
  completed_at: string | null;
  rolled_back_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LineMigrationImportPayload = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceName: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

export type LineMigrationImportRow = {
  id: string;
  migration_id: string;
  organization_id: string;
  store_id: string;
  import_batch_id: string;
  row_number: number;
  row_status: "preview" | "invalid" | "imported";
  normalized_data: LineMigrationImportPayload;
  error_message: string | null;
  imported_booking_id: string | null;
  created_at: string;
  updated_at: string;
};
