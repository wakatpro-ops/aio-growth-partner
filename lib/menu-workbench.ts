import "server-only";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { menuPermissions, type StockDocumentLine } from "@/lib/menu-workbench-rules";

export async function menuContext(storeId: string, required?: "operate" | "manager") {
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const permissions = menuPermissions(access, store.organization_id, store.id);
  if (!access || (required && !permissions[required])) throw new Error("この操作は店舗の担当権限が必要です。");
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("データに接続できません。時間をおいて開き直してください。");
  return { store, access, permissions, db };
}

export type StockDocument = {
  id: string; store_id: string; kind: "receipt" | "purchase" | "waste";
  status: "draft" | "confirmed" | "reversed"; vendor: string; document_date: string;
  lines: StockDocumentLine[]; note: string; revision: number; source_receipt_id: string | null;
  archived_at: string | null;
};

export async function stockDocuments(storeId: string, id?: string) {
  const { db, permissions } = await menuContext(storeId);
  let query = db.from("stock_documents").select("*").eq("store_id",storeId).order("updated_at",{ ascending: false });
  if (id) query = query.eq("id",id);
  if (!permissions.manager) query = query.neq("kind","purchase");
  const { data, error } = await query.limit(100);
  if (error) throw new Error("入荷・仕入の履歴を取得できませんでした。");
  return (data as StockDocument[]).map(doc => ({ ...doc, lines: doc.lines.map(line => permissions.manager ? line : { item_id: line.item_id, name: line.name, quantity: line.quantity, unit: line.unit }) }));
}

export async function menuSales(storeId: string, days: number) {
  const { db } = await menuContext(storeId,"manager");
  const end = new Date();
  const japanDay = new Date(end.getTime()+9*3600000);
  const start = new Date(japanDay.getTime() - (days-1) * 86400000).toISOString().slice(0,10);
  const until = japanDay.toISOString().slice(0,10);
  const rows: { item_id: string | null; quantity: number; total_amount: number }[] = [];
  for (let offset=0; ; offset+=1000) {
    const { data,error } = await db.from("sales_transaction_items").select("item_id,quantity,total_amount,sales_transactions!inner(business_date)").eq("store_id",storeId).gte("sales_transactions.business_date",start).lte("sales_transactions.business_date",until).order("id").range(offset,offset+999);
    if (error) throw new Error("売上明細を取得できませんでした。");
    rows.push(...data);
    if (data.length<1000) break;
    if (rows.length>=100000) throw new Error("明細が多いため、期間を短くしてください。");
  }
  return { rows,start,until };
}
