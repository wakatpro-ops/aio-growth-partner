import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import { demoCustomers, demoEstimates, demoInvoices, demoItems, demoStocks } from "@/lib/phase2/demo-data";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import type { BusinessDocument, BusinessItem, Customer, InventoryStock } from "@/types/phase2";
import type { Store } from "@/types/domain";

type DocumentKind = "estimates" | "invoices";
type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const demoPersistence = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101",
    industryTypeKey: "general_store",
    organizationName: "AIOデモ組織",
    storeName: "AIOサンプル店舗",
    address: "東京都渋谷区",
    phone: "03-0000-0000"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102",
    industryTypeKey: "auto_repair",
    organizationName: "AIOデモ組織",
    storeName: "AIOオート整備",
    address: "神奈川県横浜市",
    phone: "045-000-0000"
  }
} as const;

const demoSeedIds = {
  autoPartItem: "00000000-0000-4000-8000-000000001001",
  autoStock: "00000000-0000-4000-8000-000000001101",
  autoCustomer: "00000000-0000-4000-8000-000000001201",
  autoEstimate: "00000000-0000-4000-8000-000000001301",
  autoInvoice: "00000000-0000-4000-8000-000000001401"
};

function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function asDateText(value: FormDataEntryValue | null) {
  return asText(value) ?? new Date().toISOString().slice(0, 10);
}

function assertMutation(error: { message?: string } | null, fallback: string) {
  if (error) {
    throw new Error(error.message ? `${fallback}: ${error.message}` : fallback);
  }
}

async function nextInvoiceNumber(supabase: SupabaseClient, organizationId: string, storeId: string, requested: string | null) {
  if (requested) return { documentNumber: requested, sequenceNumber: null, prefix: null };

  const { data } = await supabase
    .from("invoice_number_sequences")
    .select("prefix, next_number")
    .eq("store_id", storeId)
    .maybeSingle();

  const prefix = data?.prefix ?? "INV";
  const nextNumber = Number(data?.next_number ?? 1);
  await supabase.from("invoice_number_sequences").upsert({
    organization_id: organizationId,
    store_id: storeId,
    prefix,
    next_number: nextNumber + 1,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });

  return {
    documentNumber: `${prefix}-${String(nextNumber).padStart(6, "0")}`,
    sequenceNumber: nextNumber,
    prefix
  };
}

function documentFallback(kind: DocumentKind, storeId: string) {
  const source = kind === "estimates" ? demoEstimates : demoInvoices;
  return source.filter((doc) => doc.store_id === storeId || storeId.startsWith("demo"));
}

function demoConfigFor(storeId: string) {
  return demoPersistence[storeId as keyof typeof demoPersistence];
}

async function ensureDemoPersistence(supabase: SupabaseClient, storeId: string) {
  const config = demoConfigFor(storeId);
  if (!config) {
    return { organizationId: null, storeId };
  }

  await supabase.from("organizations").upsert({
    id: config.organizationId,
    name: config.organizationName,
    plan_key: "starter",
    updated_at: new Date().toISOString()
  });

  await supabase.from("stores").upsert({
    id: config.storeId,
    organization_id: config.organizationId,
    industry_type_key: config.industryTypeKey,
    name: config.storeName,
    address: config.address,
    phone: config.phone,
    status: "active",
    feature_flags: {},
    profile_data: {},
    updated_at: new Date().toISOString()
  });

  if (storeId === "store-auto-demo") {
    await seedAutoRepairDemoRows(supabase, config.organizationId, config.storeId);
  }

  return { organizationId: config.organizationId, storeId: config.storeId };
}

async function resolveStoreForRead(supabase: SupabaseClient, storeId: string) {
  return ensureDemoPersistence(supabase, storeId);
}

async function resolveStoreForWrite(supabase: SupabaseClient, store: Store) {
  const demo = await ensureDemoPersistence(supabase, store.id);
  return {
    organizationId: demo.organizationId ?? store.organization_id,
    storeId: demo.storeId,
    industryTypeKey: store.industry_type_key
  };
}

async function seedAutoRepairDemoRows(
  supabase: SupabaseClient,
  organizationId: string,
  storeId: string
) {
  await supabase.from("items").upsert({
    id: demoSeedIds.autoPartItem,
    organization_id: organizationId,
    store_id: storeId,
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
    updated_at: new Date().toISOString()
  });

  await supabase.from("inventory_stocks").upsert({
    id: demoSeedIds.autoStock,
    organization_id: organizationId,
    store_id: storeId,
    item_id: demoSeedIds.autoPartItem,
    quantity: 8,
    reorder_point: 3,
    updated_at: new Date().toISOString()
  }, { onConflict: "item_id" });

  await supabase.from("customers").upsert({
    id: demoSeedIds.autoCustomer,
    organization_id: organizationId,
    store_id: storeId,
    name: "山田 太郎",
    company_name: "",
    email: "customer@example.com",
    phone: "090-0000-0000",
    address: "東京都",
    vehicle_info: { maker: "トヨタ", model: "プリウス", plate: "品川 300 あ 12-34" },
    updated_at: new Date().toISOString()
  });

  await supabase.from("estimates").upsert({
    id: demoSeedIds.autoEstimate,
    organization_id: organizationId,
    store_id: storeId,
    customer_id: demoSeedIds.autoCustomer,
    document_number: "EST-DEMO-001",
    title: "ブレーキ点検見積",
    issue_date: "2026-07-04",
    expiry_date: "2026-07-31",
    status: "draft",
    subtotal: 12000,
    tax_total: 1200,
    total: 13200,
    notes: "デモデータです。",
    updated_at: new Date().toISOString()
  });

  await supabase.from("invoices").upsert({
    id: demoSeedIds.autoInvoice,
    organization_id: organizationId,
    store_id: storeId,
    customer_id: demoSeedIds.autoCustomer,
    document_number: "INV-DEMO-001",
    title: "ブレーキ点検請求",
    issue_date: "2026-07-04",
    due_date: "2026-07-31",
    status: "issued",
    subtotal: 12000,
    tax_total: 1200,
    total: 13200,
    notes: "デモデータです。",
    updated_at: new Date().toISOString()
  });
}

export async function listBusinessItems(storeId: string, limit = 80): Promise<BusinessItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoItems.filter((item) => item.store_id === storeId || storeId.startsWith("demo"));
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase.from("items").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false }).limit(limit);
  if (error || !data) {
    return demoItems.filter((item) => item.store_id === storeId || storeId.startsWith("demo"));
  }

  return data as BusinessItem[];
}

export async function getBusinessItem(storeId: string, itemId: string): Promise<BusinessItem | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoItems.find((item) => item.id === itemId && (item.store_id === storeId || storeId.startsWith("demo"))) ?? null;
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase.from("items").select("*").eq("store_id", resolved.storeId).eq("id", itemId).single();
  if (error || !data) {
    return demoItems.find((item) => item.id === itemId) ?? null;
  }

  return data as BusinessItem;
}

export async function listInventoryStocks(storeId: string): Promise<InventoryStock[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoStocks.filter((stock) => stock.store_id === storeId || storeId.startsWith("demo"));
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase
    .from("inventory_stocks")
    .select("*, item:items(name, sku, unit, item_type)")
    .eq("store_id", resolved.storeId)
    .order("updated_at", { ascending: false });
  if (error || !data) {
    return demoStocks.filter((stock) => stock.store_id === storeId || storeId.startsWith("demo"));
  }

  return data as InventoryStock[];
}

export async function listCustomers(storeId: string, limit = 80): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoCustomers.filter((customer) => customer.store_id === storeId || storeId.startsWith("demo"));
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase.from("customers").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false }).limit(limit);
  if (error || !data) {
    return demoCustomers.filter((customer) => customer.store_id === storeId || storeId.startsWith("demo"));
  }

  return data as Customer[];
}

export async function getCustomer(storeId: string, customerId: string): Promise<Customer | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoCustomers.find((customer) => customer.id === customerId && (customer.store_id === storeId || storeId.startsWith("demo"))) ?? null;
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase.from("customers").select("*").eq("store_id", resolved.storeId).eq("id", customerId).single();
  if (error || !data) {
    return demoCustomers.find((customer) => customer.id === customerId) ?? null;
  }

  return data as Customer;
}

export async function listDocuments(storeId: string, kind: DocumentKind, limit = 80): Promise<BusinessDocument[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return documentFallback(kind, storeId);
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase
    .from(kind)
    .select("*, customer:customers(name, company_name, email, phone)")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    return documentFallback(kind, storeId);
  }

  return data as BusinessDocument[];
}

export async function getDocument(storeId: string, documentId: string, kind: DocumentKind): Promise<BusinessDocument | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return documentFallback(kind, storeId).find((doc) => doc.id === documentId) ?? null;
  }

  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data, error } = await supabase
    .from(kind)
    .select("*, customer:customers(name, company_name, email, phone)")
    .eq("store_id", resolved.storeId)
    .eq("id", documentId)
    .single();
  if (error || !data) {
    return documentFallback(kind, storeId).find((doc) => doc.id === documentId) ?? null;
  }

  return data as BusinessDocument;
}

export async function createItemFromForm(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForWrite(supabase, store);

  const unitPrice = asNumber(formData.get("unit_price"));
  const taxRate = asNumber(formData.get("tax_rate"), 10);
  const { data, error } = await supabase
    .from("items")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      industry_type_key: resolved.industryTypeKey,
      item_type: String(formData.get("item_type") ?? "product"),
      name: String(formData.get("name") ?? ""),
      sku: asText(formData.get("sku")),
      description: asText(formData.get("description")),
      unit: String(formData.get("unit") ?? "個"),
      unit_price: unitPrice,
      cost_price: asNumber(formData.get("cost_price")),
      tax_rate: taxRate,
      is_stock_managed: formData.get("is_stock_managed") === "on",
      status: String(formData.get("status") ?? "active")
    })
    .select("id, is_stock_managed")
    .single();

  if (!error && data?.is_stock_managed) {
    await supabase.from("inventory_stocks").insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      item_id: data.id,
      quantity: asNumber(formData.get("quantity")),
      reorder_point: asNumber(formData.get("reorder_point"))
    });
  }
}

export async function updateItemFromForm(storeId: string, itemId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);

  await supabase
    .from("items")
    .update({
      item_type: String(formData.get("item_type") ?? "product"),
      name: String(formData.get("name") ?? ""),
      sku: asText(formData.get("sku")),
      description: asText(formData.get("description")),
      unit: String(formData.get("unit") ?? "個"),
      unit_price: asNumber(formData.get("unit_price")),
      cost_price: asNumber(formData.get("cost_price")),
      tax_rate: asNumber(formData.get("tax_rate"), 10),
      is_stock_managed: formData.get("is_stock_managed") === "on",
      status: String(formData.get("status") ?? "active"),
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", itemId);
}

export async function deleteItem(storeId: string, itemId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);
  await supabase.from("items").delete().eq("store_id", resolved.storeId).eq("id", itemId);
}

export async function updateStockFromForm(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForWrite(supabase, store);

  await supabase.from("inventory_stocks").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    item_id: String(formData.get("item_id") ?? ""),
    quantity: asNumber(formData.get("quantity")),
    reorder_point: asNumber(formData.get("reorder_point")),
    updated_at: new Date().toISOString()
  }, { onConflict: "item_id" });
}

export async function createCustomerFromForm(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForWrite(supabase, store);

  const { error } = await supabase.from("customers").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    name: String(formData.get("name") ?? ""),
    company_name: asText(formData.get("company_name")),
    email: asText(formData.get("email")),
    phone: asText(formData.get("phone")),
    address: asText(formData.get("address")),
    vehicle_info: {
      maker: asText(formData.get("vehicle_maker")),
      model: asText(formData.get("vehicle_model")),
      plate: asText(formData.get("vehicle_plate"))
    }
  });
  assertMutation(error, "顧客を保存できませんでした");
}

export async function updateCustomerFromForm(storeId: string, customerId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);

  const { error } = await supabase
    .from("customers")
    .update({
      name: String(formData.get("name") ?? ""),
      company_name: asText(formData.get("company_name")),
      email: asText(formData.get("email")),
      phone: asText(formData.get("phone")),
      address: asText(formData.get("address")),
      vehicle_info: {
        maker: asText(formData.get("vehicle_maker")),
        model: asText(formData.get("vehicle_model")),
        plate: asText(formData.get("vehicle_plate"))
      },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", customerId);
  assertMutation(error, "顧客を更新できませんでした");
}

export async function deleteCustomer(storeId: string, customerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);
  await supabase.from("customers").delete().eq("store_id", resolved.storeId).eq("id", customerId);
}

export async function createDocumentFromForm(storeId: string, kind: DocumentKind, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForWrite(supabase, store);

  const subtotal = asNumber(formData.get("subtotal"));
  const taxTotal = asNumber(formData.get("tax_total"));
  const tax10Subtotal = asNumber(formData.get("tax_10_subtotal"), subtotal);
  const tax10Amount = asNumber(formData.get("tax_10_amount"), taxTotal);
  const tax8Subtotal = asNumber(formData.get("tax_8_subtotal"));
  const tax8Amount = asNumber(formData.get("tax_8_amount"));
  const requestedNumber = asText(formData.get("document_number"));
  const invoiceNumber = kind === "invoices"
    ? await nextInvoiceNumber(supabase, resolved.organizationId, resolved.storeId, requestedNumber)
    : { documentNumber: requestedNumber ?? "", sequenceNumber: null, prefix: null };
  const payload = {
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    customer_id: asText(formData.get("customer_id")),
    document_number: invoiceNumber.documentNumber,
    title: String(formData.get("title") ?? ""),
    issue_date: asDateText(formData.get("issue_date")),
    status: String(formData.get("status") ?? "draft"),
    subtotal: subtotal,
    tax_total: taxTotal,
    total: subtotal + taxTotal,
    tax_10_subtotal: tax10Subtotal,
    tax_10_amount: tax10Amount,
    tax_8_subtotal: tax8Subtotal,
    tax_8_amount: tax8Amount,
    notes: asText(formData.get("notes"))
  };

  const dateFields = kind === "estimates"
    ? { expiry_date: asText(formData.get("expiry_date")) }
    : {
        due_date: asText(formData.get("due_date")),
        transaction_date: asText(formData.get("transaction_date")),
        invoice_registration_number: asText(formData.get("invoice_registration_number")),
        qualified_invoice_issuer_name: asText(formData.get("qualified_invoice_issuer_name")),
        invoice_sequence_number: invoiceNumber.sequenceNumber,
        invoice_number_prefix: invoiceNumber.prefix,
        payment_status: String(formData.get("payment_status") ?? "unpaid"),
        payment_method: asText(formData.get("payment_method")),
        issued_at: String(formData.get("status") ?? "draft") === "issued" ? new Date().toISOString() : null
      };

  const { data, error } = await supabase.from(kind).insert({ ...payload, ...dateFields }).select("id").single();
  if (error) {
    throw new Error(`${kind}の保存に失敗しました: ${error.message}`);
  }
  await logAuditEvent({
    storeId,
    actionType: kind === "estimates" ? "estimate_created" : "invoice_created",
    targetType: kind === "estimates" ? "estimate" : "invoice",
    targetId: data.id,
    message: `${payload.document_number} を作成しました。`
  });
}

export async function updateDocumentFromForm(storeId: string, documentId: string, kind: DocumentKind, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);

  const subtotal = asNumber(formData.get("subtotal"));
  const taxTotal = asNumber(formData.get("tax_total"));
  const payload = {
    customer_id: asText(formData.get("customer_id")),
    document_number: String(formData.get("document_number") ?? ""),
    title: String(formData.get("title") ?? ""),
    issue_date: String(formData.get("issue_date") ?? new Date().toISOString().slice(0, 10)),
    status: String(formData.get("status") ?? "draft"),
    subtotal,
    tax_total: taxTotal,
    total: subtotal + taxTotal,
    tax_10_subtotal: asNumber(formData.get("tax_10_subtotal"), subtotal),
    tax_10_amount: asNumber(formData.get("tax_10_amount"), taxTotal),
    tax_8_subtotal: asNumber(formData.get("tax_8_subtotal")),
    tax_8_amount: asNumber(formData.get("tax_8_amount")),
    notes: asText(formData.get("notes")),
    updated_at: new Date().toISOString()
  };

  const dateFields = kind === "estimates"
    ? { expiry_date: asText(formData.get("expiry_date")) }
    : {
        due_date: asText(formData.get("due_date")),
        transaction_date: asText(formData.get("transaction_date")),
        invoice_registration_number: asText(formData.get("invoice_registration_number")),
        qualified_invoice_issuer_name: asText(formData.get("qualified_invoice_issuer_name")),
        payment_status: String(formData.get("payment_status") ?? "unpaid"),
        payment_method: asText(formData.get("payment_method")),
        issued_at: String(formData.get("status") ?? "draft") === "issued" ? new Date().toISOString() : null
      };

  const { error } = await supabase
    .from(kind)
    .update({ ...payload, ...dateFields })
    .eq("store_id", resolved.storeId)
    .eq("id", documentId);
  if (error) {
    throw new Error(`${kind}の更新に失敗しました: ${error.message}`);
  }
  await logAuditEvent({
    storeId,
    actionType: kind === "estimates" ? "estimate_updated" : "invoice_updated",
    targetType: kind === "estimates" ? "estimate" : "invoice",
    targetId: documentId,
    message: `${payload.document_number} を更新しました。`
  });
}

export async function deleteDocument(storeId: string, documentId: string, kind: DocumentKind) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);
  await supabase.from(kind).delete().eq("store_id", resolved.storeId).eq("id", documentId);
  await logAuditEvent({
    storeId,
    actionType: kind === "estimates" ? "estimate_deleted" : "invoice_deleted",
    targetType: kind === "estimates" ? "estimate" : "invoice",
    targetId: documentId,
    message: `${kind} を削除しました。`
  });
}
