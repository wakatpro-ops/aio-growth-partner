import "server-only";

import { getCurrentUserAccess } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StoreArchiveEntity =
  | "item"
  | "customer"
  | "customer_note"
  | "customer_import"
  | "customer_message"
  | "aio_improvement_task"
  | "estimate"
  | "invoice"
  | "order"
  | "data_import"
  | "marketing_draft"
  | "ai_recommendation"
  | "sales_ai_report"
  | "growth_action"
  | "expense_receipt";

type EntityConfig = {
  table: string;
  label: string;
  select: string;
  describe: (row: Record<string, unknown>) => string;
};

const entityConfigs: Record<StoreArchiveEntity, EntityConfig> = {
  item: { table: "items", label: "商品・サービス", select: "name", describe: (row) => String(row.name ?? "名称未設定") },
  customer: { table: "customers", label: "顧客", select: "name, company_name", describe: (row) => String(row.name ?? row.company_name ?? "名称未設定") },
  customer_note: { table: "customer_notes", label: "顧客メモ", select: "body", describe: (row) => String(row.body ?? "メモ") },
  customer_import: { table: "customer_import_jobs", label: "顧客データ取込", select: "original_filename, status", describe: (row) => String(row.original_filename ?? "ファイル名なし") },
  customer_message: { table: "customer_message_drafts", label: "顧客メッセージ", select: "title, channel", describe: (row) => String(row.title ?? "タイトル未設定") },
  aio_improvement_task: { table: "aio_improvement_tasks", label: "AIO改善項目", select: "title, status", describe: (row) => String(row.title ?? "改善内容未設定") },
  estimate: { table: "estimates", label: "見積書", select: "document_number, title", describe: (row) => [row.document_number, row.title].filter(Boolean).join(" / ") },
  invoice: { table: "invoices", label: "請求書", select: "document_number, title", describe: (row) => [row.document_number, row.title].filter(Boolean).join(" / ") },
  order: { table: "orders", label: "受注", select: "order_number, title", describe: (row) => [row.order_number, row.title].filter(Boolean).join(" / ") },
  data_import: { table: "data_import_jobs", label: "売上データ取込", select: "original_filename, status", describe: (row) => String(row.original_filename ?? "ファイル名なし") },
  marketing_draft: { table: "marketing_drafts", label: "集客下書き", select: "title, channel", describe: (row) => String(row.title ?? "タイトル未設定") },
  ai_recommendation: { table: "ai_recommendations", label: "AI改善提案", select: "title, month", describe: (row) => [row.month, row.title].filter(Boolean).join(" / ") },
  sales_ai_report: { table: "sales_ai_reports", label: "AI月次売上レポート", select: "title, target_month", describe: (row) => [row.target_month, row.title].filter(Boolean).join(" / ") },
  growth_action: { table: "growth_actions", label: "集客アクション", select: "title, target_channel", describe: (row) => String(row.title ?? "タイトル未設定") },
  expense_receipt: { table: "expense_receipts", label: "経費レシート", select: "original_file_name, vendor_name", describe: (row) => String(row.vendor_name ?? row.original_file_name ?? "名称未設定") }
};

export type ArchivedStoreRecord = {
  entity: StoreArchiveEntity;
  entityLabel: string;
  id: string;
  label: string;
  archivedAt: string;
  createdAt: string | null;
};

export function storeArchiveEntityLabel(entity: StoreArchiveEntity) {
  return entityConfigs[entity].label;
}

export async function setStoreEntityArchived(storeId: string, entity: StoreArchiveEntity, recordId: string, archived: boolean) {
  await getStore(storeId);
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const config = entityConfigs[entity];
  if (!config) throw new Error("アーカイブ対象が正しくありません。");

  const timestamp = new Date().toISOString();
  const payload = archived
    ? { archived_at: timestamp, archived_by: access.userId, updated_at: timestamp }
    : { archived_at: null, archived_by: null, updated_at: timestamp };
  const { data, error } = await supabase
    .from(config.table)
    .update(payload)
    .eq("store_id", storeId)
    .eq("id", recordId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`${config.label}を${archived ? "アーカイブ" : "復元"}できませんでした: ${error.message}`);
  if (!data) throw new Error(`${config.label}が見つかりません。`);

  await logAuditEvent({
    storeId,
    actionType: `${entity}_${archived ? "archived" : "restored"}`,
    targetType: entity,
    targetId: recordId,
    message: `${config.label}を${archived ? "アーカイブ" : "復元"}しました。`
  });
}

export async function listArchivedStoreRecords(storeId: string): Promise<ArchivedStoreRecord[]> {
  await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const entries = Object.entries(entityConfigs) as Array<[StoreArchiveEntity, EntityConfig]>;
  const results = await Promise.all(entries.map(async ([entity, config]) => {
    const { data, error } = await supabase
      .from(config.table)
      .select(`id, archived_at, created_at, ${config.select}`)
      .eq("store_id", storeId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`${config.label}のアーカイブ一覧を取得できませんでした: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      entity,
      entityLabel: config.label,
      id: String(row.id),
      label: config.describe(row) || "名称未設定",
      archivedAt: String(row.archived_at),
      createdAt: row.created_at ? String(row.created_at) : null
    }));
  }));

  return results.flat().sort((left, right) => right.archivedAt.localeCompare(left.archivedAt));
}
