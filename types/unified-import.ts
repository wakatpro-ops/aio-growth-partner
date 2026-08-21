export type UnifiedImportRecordType = "sale" | "expense" | "customer" | "item" | "inventory" | "unknown" | "ignore";

export type UnifiedImportStatus =
  | "analyzing"
  | "questions_required"
  | "review_required"
  | "review_ready"
  | "importing"
  | "completed"
  | "partial_failed"
  | "failed";

export type UnifiedImportSheetSummary = {
  name: string;
  headerRowNumber: number;
  headers: string[];
  rowCount: number;
  suggestedRecordType: UnifiedImportRecordType;
  confidence: number;
  macroNotice?: string | null;
};

export type UnifiedImportQuestion = {
  key: string;
  sheetName: string;
  rowId?: string | null;
  rowNumber?: number | null;
  field?: string | null;
  prompt: string;
  options?: UnifiedImportRecordType[];
};

export type ParsedUnifiedImportRow = {
  sheetName: string;
  rowNumber: number;
  rawData: Record<string, string>;
  suggestedRecordType: UnifiedImportRecordType;
  confidence: number;
  normalizedData: Record<string, string | number | boolean | null>;
  missingFields: string[];
  question: string | null;
};

export type ParsedUnifiedImport = {
  fileType: "csv" | "excel" | "pdf";
  macroEnabled: boolean;
  sheets: UnifiedImportSheetSummary[];
  rows: ParsedUnifiedImportRow[];
};

export type UnifiedImportJob = {
  id: string;
  organization_id: string;
  store_id: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  file_sha256: string;
  file_type: string;
  mime_type: string | null;
  file_size: number;
  macro_enabled: boolean;
  status: UnifiedImportStatus;
  sheet_summaries: UnifiedImportSheetSummary[];
  questions: UnifiedImportQuestion[];
  answers: Record<string, unknown>;
  total_rows: number;
  approved_rows: number;
  success_rows: number;
  error_rows: number;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
};

export type UnifiedImportRow = {
  id: string;
  import_job_id: string;
  organization_id: string;
  store_id: string;
  sheet_name: string;
  row_number: number;
  raw_data: Record<string, string>;
  suggested_record_type: UnifiedImportRecordType;
  confidence: number;
  normalized_data: Record<string, string | number | boolean | null>;
  missing_fields: string[];
  question: string | null;
  review_status: "ready" | "question" | "ignored" | "approved" | "imported" | "error";
  confirmed_record_type: UnifiedImportRecordType | null;
  user_corrections: Record<string, unknown>;
  result_table: string | null;
  result_id: string | null;
  error_message: string | null;
};
