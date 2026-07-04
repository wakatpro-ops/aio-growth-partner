export type ImportProviderKey =
  | "air_regi"
  | "smaregi"
  | "square"
  | "stores_regi"
  | "pos_plus"
  | "shopify"
  | "base"
  | "google_sheets"
  | "manual_csv"
  | "manual_excel";

export type DataImportStatus =
  | "uploaded"
  | "parsing"
  | "mapping_required"
  | "preview_ready"
  | "importing"
  | "completed"
  | "partial_failed"
  | "failed"
  | "canceled";

export type StandardSalesField =
  | "ignore"
  | "sale_date"
  | "transaction_id"
  | "item_name"
  | "item_code"
  | "category_name"
  | "quantity"
  | "unit_price"
  | "subtotal"
  | "tax_amount"
  | "gross_amount"
  | "discount_amount"
  | "payment_method"
  | "customer_name"
  | "channel"
  | "memo";

export type ParsedSalesRow = Record<string, string>;

export type DataImportJob = {
  id: string;
  organization_id: string;
  store_id: string;
  data_source_id: string | null;
  status: DataImportStatus;
  import_type: "csv" | "excel";
  original_filename: string | null;
  encoding: string | null;
  delimiter: string | null;
  header_row_number: number;
  detected_columns: string[];
  mapping_status: "pending" | "confirmed";
  preview_rows: ParsedSalesRow[];
  normalized_preview: NormalizedSalesPreviewRow[];
  total_rows: number;
  success_rows: number;
  error_rows: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  data_source?: { name: string; provider_key: ImportProviderKey } | null;
  file?: DataImportFile | null;
};

export type DataImportFile = {
  id: string;
  import_job_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  created_at: string;
};

export type DataColumnMapping = {
  id: string;
  source_column_name: string;
  source_column_index: number;
  target_field: StandardSalesField;
  confidence: number | null;
  created_by: "ai" | "user" | "system" | "template";
};

export type NormalizedSalesPreviewRow = {
  rowNumber: number;
  sale_date: string | null;
  transaction_id: string | null;
  item_name: string | null;
  item_code: string | null;
  category_name: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  tax_amount: number;
  gross_amount: number;
  discount_amount: number;
  payment_method: string | null;
  customer_name: string | null;
  channel: string | null;
  memo: string | null;
  source_row_hash: string;
  errors: string[];
};

export type SalesTransactionListRow = {
  id: string;
  business_date: string;
  transaction_date: string;
  gross_amount: number;
  payment_method: string | null;
  created_at: string;
  import_job_id: string | null;
  data_source?: { name: string; provider_key: ImportProviderKey } | null;
  items?: Array<{
    item_name: string;
    quantity: number;
    total_amount: number;
  }>;
};

export type SalesReport = {
  totalSales: number;
  transactionCount: number;
  averageTransactionAmount: number;
  daily: Array<{ label: string; amount: number; count: number }>;
  monthly: Array<{ label: string; amount: number; count: number }>;
  items: Array<{ label: string; amount: number; quantity: number }>;
  paymentMethods: Array<{ label: string; amount: number; count: number }>;
};

export type SalesAnalysisSummary = {
  targetMonth: string;
  totalSales: number;
  previousMonthSales: number;
  monthOverMonthRate: number | null;
  transactionCount: number;
  averageTransactionAmount: number;
  topItems: Array<{ label: string; amount: number; quantity: number }>;
  paymentMethods: Array<{ label: string; amount: number; count: number }>;
  daily: Array<{ label: string; amount: number; count: number }>;
  weekday: Array<{ label: string; amount: number; count: number }>;
  risingItems: Array<{ label: string; currentAmount: number; previousAmount: number; changeRate: number | null }>;
  fallingItems: Array<{ label: string; currentAmount: number; previousAmount: number; changeRate: number | null }>;
};

export type SalesAnomalyFlag = {
  id?: string;
  anomaly_type: string;
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  source_data: Record<string, unknown>;
  status?: string;
};

export type SalesAiReportOutput = {
  title: string;
  good_points: string[];
  cautions: string[];
  growth_items: string[];
  promotion_ideas: string[];
  inventory_notes: string[];
  next_actions: string[];
  industry_advice: string[];
  ai_reasoning: string;
};

export type SalesAiReport = {
  id: string;
  organization_id: string;
  store_id: string;
  industry_type_key: string;
  target_month: string;
  title: string;
  summary_metrics: SalesAnalysisSummary;
  ai_result: SalesAiReportOutput;
  anomaly_summary: SalesAnomalyFlag[];
  prompt_version: string;
  model_name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type DemandForecast = {
  id: string;
  organization_id: string;
  store_id: string;
  target_month: string;
  item_name: string;
  forecast_type: "growth" | "decline" | "stable";
  current_value: number;
  previous_value: number;
  predicted_value: number;
  confidence: number;
  reason: string;
  status: string;
  created_at: string;
};

export type InventoryAlert = {
  id: string;
  organization_id: string;
  store_id: string;
  target_month: string;
  item_name: string;
  alert_type: "stockout_risk" | "overstock_risk" | "reorder_candidate";
  current_stock: number;
  reorder_point: number;
  recent_sales_quantity: number;
  severity: "low" | "medium" | "high";
  reason: string;
  status: string;
  created_at: string;
};

export type RecommendedAction = {
  id: string;
  organization_id: string;
  store_id: string;
  target_month: string;
  action_type: "instagram" | "google_business_profile" | "store_pop" | "customer_message" | "inventory_order" | "service_focus";
  title: string;
  body: string;
  item_name: string | null;
  priority: "low" | "medium" | "high";
  reason: string;
  status: string;
  created_at: string;
};
