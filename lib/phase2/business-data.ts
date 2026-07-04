import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import { demoCustomers, demoEstimates, demoInvoices, demoItems, demoStocks } from "@/lib/phase2/demo-data";
import type { BusinessDocument, BusinessItem, Customer, InventoryStock } from "@/types/phase2";

type DocumentKind = "estimates" | "invoices";

function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function documentFallback(kind: DocumentKind, storeId: string) {
  const source = kind === "estimates" ? demoEstimates : demoInvoices;
  return source.filter((doc) => doc.store_id === storeId || storeId.startsWith("demo"));
}

export async function listBusinessItems(storeId: string): Promise<BusinessItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoItems.filter((item) => item.store_id === storeId || storeId.startsWith("demo"));
  }

  const { data, error } = await supabase.from("items").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
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

  const { data, error } = await supabase.from("items").select("*").eq("store_id", storeId).eq("id", itemId).single();
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

  const { data, error } = await supabase
    .from("inventory_stocks")
    .select("*, item:items(name, sku, unit, item_type)")
    .eq("store_id", storeId)
    .order("updated_at", { ascending: false });
  if (error || !data) {
    return demoStocks.filter((stock) => stock.store_id === storeId || storeId.startsWith("demo"));
  }

  return data as InventoryStock[];
}

export async function listCustomers(storeId: string): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoCustomers.filter((customer) => customer.store_id === storeId || storeId.startsWith("demo"));
  }

  const { data, error } = await supabase.from("customers").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
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

  const { data, error } = await supabase.from("customers").select("*").eq("store_id", storeId).eq("id", customerId).single();
  if (error || !data) {
    return demoCustomers.find((customer) => customer.id === customerId) ?? null;
  }

  return data as Customer;
}

export async function listDocuments(storeId: string, kind: DocumentKind): Promise<BusinessDocument[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return documentFallback(kind, storeId);
  }

  const { data, error } = await supabase
    .from(kind)
    .select("*, customer:customers(name, company_name, email, phone)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });
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

  const { data, error } = await supabase
    .from(kind)
    .select("*, customer:customers(name, company_name, email, phone)")
    .eq("store_id", storeId)
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

  const unitPrice = asNumber(formData.get("unit_price"));
  const taxRate = asNumber(formData.get("tax_rate"), 10);
  const { data, error } = await supabase
    .from("items")
    .insert({
      organization_id: store.organization_id,
      store_id: store.id,
      industry_type_key: store.industry_type_key,
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
      organization_id: store.organization_id,
      store_id: store.id,
      item_id: data.id,
      quantity: asNumber(formData.get("quantity")),
      reorder_point: asNumber(formData.get("reorder_point"))
    });
  }
}

export async function updateItemFromForm(storeId: string, itemId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

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
    .eq("store_id", storeId)
    .eq("id", itemId);
}

export async function deleteItem(storeId: string, itemId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("items").delete().eq("store_id", storeId).eq("id", itemId);
}

export async function updateStockFromForm(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("inventory_stocks").upsert({
    organization_id: store.organization_id,
    store_id: store.id,
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

  await supabase.from("customers").insert({
    organization_id: store.organization_id,
    store_id: store.id,
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
}

export async function updateCustomerFromForm(storeId: string, customerId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  await supabase
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
    .eq("store_id", storeId)
    .eq("id", customerId);
}

export async function deleteCustomer(storeId: string, customerId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("customers").delete().eq("store_id", storeId).eq("id", customerId);
}

export async function createDocumentFromForm(storeId: string, kind: DocumentKind, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  const subtotal = asNumber(formData.get("subtotal"));
  const taxTotal = asNumber(formData.get("tax_total"));
  await supabase.from(kind).insert({
    organization_id: store.organization_id,
    store_id: store.id,
    customer_id: asText(formData.get("customer_id")),
    document_number: String(formData.get("document_number") ?? ""),
    title: String(formData.get("title") ?? ""),
    issue_date: String(formData.get("issue_date") ?? new Date().toISOString().slice(0, 10)),
    expiry_date: kind === "estimates" ? asText(formData.get("expiry_date")) : null,
    due_date: kind === "invoices" ? asText(formData.get("due_date")) : null,
    status: String(formData.get("status") ?? "draft"),
    subtotal: subtotal,
    tax_total: taxTotal,
    total: subtotal + taxTotal,
    notes: asText(formData.get("notes"))
  });
}

export async function updateDocumentFromForm(storeId: string, documentId: string, kind: DocumentKind, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  const subtotal = asNumber(formData.get("subtotal"));
  const taxTotal = asNumber(formData.get("tax_total"));
  await supabase
    .from(kind)
    .update({
      customer_id: asText(formData.get("customer_id")),
      document_number: String(formData.get("document_number") ?? ""),
      title: String(formData.get("title") ?? ""),
      issue_date: String(formData.get("issue_date") ?? new Date().toISOString().slice(0, 10)),
      expiry_date: kind === "estimates" ? asText(formData.get("expiry_date")) : null,
      due_date: kind === "invoices" ? asText(formData.get("due_date")) : null,
      status: String(formData.get("status") ?? "draft"),
      subtotal,
      tax_total: taxTotal,
      total: subtotal + taxTotal,
      notes: asText(formData.get("notes")),
      updated_at: new Date().toISOString()
    })
    .eq("store_id", storeId)
    .eq("id", documentId);
}

export async function deleteDocument(storeId: string, documentId: string, kind: DocumentKind) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from(kind).delete().eq("store_id", storeId).eq("id", documentId);
}
