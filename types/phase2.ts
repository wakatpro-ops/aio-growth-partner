import type { IndustryTypeKey } from "@/types/domain";

export type ItemType = "product" | "part" | "service";
export type DocumentStatus =
  | "draft"
  | "sent"
  | "approved"
  | "ordered"
  | "in_progress"
  | "completed"
  | "issued"
  | "paid"
  | "void";
export type PaymentStatus = "not_billed" | "billed" | "unpaid" | "partially_paid" | "paid" | "void";
export type PaymentMethod = "cash" | "credit_card" | "qr_payment" | "bank_transfer" | "other";

export type BusinessItem = {
  id: string;
  organization_id: string;
  store_id: string;
  industry_type_key: IndustryTypeKey;
  item_type: ItemType;
  name: string;
  sku: string | null;
  description: string | null;
  unit: string;
  unit_price: number;
  cost_price: number;
  tax_rate: number;
  is_stock_managed: boolean;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type InventoryStock = {
  id: string;
  organization_id: string;
  store_id: string;
  item_id: string;
  quantity: number;
  reorder_point: number;
  updated_at: string;
  item?: Pick<BusinessItem, "name" | "sku" | "unit" | "item_type">;
};

export type Customer = {
  id: string;
  organization_id: string;
  store_id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  vehicle_info: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BusinessDocument = {
  id: string;
  organization_id: string;
  store_id: string;
  customer_id: string | null;
  document_number: string;
  title: string;
  issue_date: string;
  expiry_date: string | null;
  due_date: string | null;
  status: DocumentStatus;
  subtotal: number;
  tax_total: number;
  total: number;
  paid_at?: string | null;
  invoice_registration_number?: string | null;
  qualified_invoice_issuer_name?: string | null;
  transaction_date?: string | null;
  invoice_sequence_number?: number | null;
  invoice_number_prefix?: string | null;
  tax_10_subtotal?: number;
  tax_10_amount?: number;
  tax_8_subtotal?: number;
  tax_8_amount?: number;
  payment_status?: PaymentStatus | null;
  payment_method?: PaymentMethod | null;
  issued_at?: string | null;
  last_pdf_issued_at?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: Pick<Customer, "name" | "company_name" | "email" | "phone"> | null;
};

export type PaymentRecord = {
  id: string;
  organization_id: string;
  store_id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  status: "received" | "partial" | "cancelled";
  memo: string | null;
  created_at: string;
  invoice?: Pick<BusinessDocument, "document_number" | "title" | "total"> | null;
};

export type BusinessOrder = {
  id: string;
  organization_id: string;
  store_id: string;
  estimate_id: string | null;
  invoice_id: string | null;
  customer_id: string | null;
  order_number: string;
  title: string;
  status: "ordered" | "in_progress" | "completed" | "invoiced" | "cancelled";
  ordered_at: string | null;
  completed_at: string | null;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: Pick<Customer, "name" | "company_name"> | null;
};

export type AuditLog = {
  id: string;
  store_id: string;
  actor_user_id: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
