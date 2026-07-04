import type { BusinessDocument, BusinessItem, Customer, InventoryStock } from "@/types/phase2";

export const demoItems: BusinessItem[] = [
  {
    id: "demo-oil-change",
    organization_id: "demo-org",
    store_id: "store-general-demo",
    industry_type_key: "general_store",
    item_type: "service",
    name: "基本メンテナンス",
    sku: "SVC-001",
    description: "店舗で提供する標準サービスです。",
    unit: "回",
    unit_price: 5500,
    cost_price: 0,
    tax_rate: 10,
    is_stock_managed: false,
    status: "active",
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "demo-brake-pad",
    organization_id: "demo-org",
    store_id: "store-auto-demo",
    industry_type_key: "auto_repair",
    item_type: "part",
    name: "ブレーキパッド",
    sku: "PART-001",
    description: "交換作業向けの主要部品です。",
    unit: "個",
    unit_price: 12000,
    cost_price: 7200,
    tax_rate: 10,
    is_stock_managed: true,
    status: "active",
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const demoStocks: InventoryStock[] = [
  {
    id: "demo-stock-brake-pad",
    organization_id: "demo-org",
    store_id: "store-auto-demo",
    item_id: "demo-brake-pad",
    quantity: 8,
    reorder_point: 3,
    item: {
      name: "ブレーキパッド",
      sku: "PART-001",
      unit: "個",
      item_type: "part"
    },
    updated_at: new Date().toISOString()
  }
];

export const demoCustomers: Customer[] = [
  {
    id: "demo-customer",
    organization_id: "demo-org",
    store_id: "store-auto-demo",
    name: "山田 太郎",
    company_name: "",
    email: "customer@example.com",
    phone: "090-0000-0000",
    address: "東京都",
    vehicle_info: { maker: "トヨタ", model: "プリウス", plate: "品川 300 あ 12-34" },
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const demoEstimates: BusinessDocument[] = [
  {
    id: "demo-estimate",
    organization_id: "demo-org",
    store_id: "store-auto-demo",
    customer_id: "demo-customer",
    document_number: "EST-DEMO-001",
    title: "ブレーキ点検見積",
    issue_date: "2026-07-04",
    expiry_date: "2026-07-31",
    due_date: null,
    status: "draft",
    subtotal: 12000,
    tax_total: 1200,
    total: 13200,
    notes: "デモデータです。",
    customer: {
      name: "山田 太郎",
      company_name: "",
      email: "customer@example.com",
      phone: "090-0000-0000"
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export const demoInvoices: BusinessDocument[] = [
  {
    id: "demo-invoice",
    organization_id: "demo-org",
    store_id: "store-auto-demo",
    customer_id: "demo-customer",
    document_number: "INV-DEMO-001",
    title: "ブレーキ点検請求",
    issue_date: "2026-07-04",
    expiry_date: null,
    due_date: "2026-07-31",
    status: "issued",
    subtotal: 12000,
    tax_total: 1200,
    total: 13200,
    notes: "デモデータです。",
    customer: {
      name: "山田 太郎",
      company_name: "",
      email: "customer@example.com",
      phone: "090-0000-0000"
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
