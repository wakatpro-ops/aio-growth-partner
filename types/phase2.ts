import type { IndustryTypeKey } from "@/types/domain";

export type ItemType = "product" | "part" | "service";
export type DocumentStatus = "draft" | "sent" | "approved" | "issued" | "paid" | "void";

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
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer?: Pick<Customer, "name" | "company_name" | "email" | "phone"> | null;
};
