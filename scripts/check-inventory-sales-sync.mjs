import { existsSync, readFileSync } from "node:fs";

const migration = readFileSync("database/migrations/phase-inventory-sales-sync.sql", "utf8");
const policies = readFileSync("database/policies.sql", "utf8");
const parser = readFileSync("lib/phase4/import-parser.ts", "utf8");
const imports = readFileSync("lib/phase4/sales-import-data.ts", "utf8");
const inventory = readFileSync("lib/inventory-operations.ts", "utf8");

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

for (const table of ["order_items", "import_item_matches"]) {
  requireCheck(migration.includes(`create table if not exists public.${table}`), `テーブルが不足しています: ${table}`);
  requireCheck(policies.includes(`alter table public.${table} enable row level security`), `RLSが不足しています: ${table}`);
}

for (const route of [
  "app/stores/[storeId]/inventory/page.tsx",
  "app/stores/[storeId]/orders/[orderId]/page.tsx",
  "app/stores/[storeId]/data-imports/new/page.tsx",
  "app/stores/[storeId]/data-imports/[importJobId]/page.tsx"
]) requireCheck(existsSync(route), `画面が不足しています: ${route}`);

requireCheck(migration.includes("inventory_movements_store_key_unique"), "在庫変動の重複防止キーがありません。");
requireCheck(migration.includes("to service_role") && !migration.includes("to authenticated, service_role"), "在庫RPCが一般ユーザーへ直接公開されています。");
requireCheck(policies.includes("public.is_org_editor(organization_id)"), "閲覧専用ユーザーの更新防止がありません。");
requireCheck(inventory.includes("order_reserve") && inventory.includes("order_fulfill") && inventory.includes("order_return"), "受注・完了・取消の在庫連動が不足しています。");
requireCheck(inventory.includes(":restore:"), "削除明細を戻した際の在庫再引当がありません。");
requireCheck(inventory.includes("actor_name") && inventory.includes("reason"), "在庫履歴の担当者・理由が不足しています。");

requireCheck(parser.includes('importType: "pdf"') && parser.includes("parser.getTable()"), "PDF売上帳票の表抽出がありません。");
requireCheck(parser.includes("MAX_IMPORT_FILE_SIZE") && parser.includes("MAX_IMPORT_ROWS"), "大容量ファイル制限がありません。");
requireCheck(parser.includes("空ファイルは取り込めません") && parser.includes("PDFから表形式"), "空・破損ファイルの説明が不足しています。");
requireCheck(imports.includes('url.hostname !== "docs.google.com"'), "GoogleスプレッドシートURLの安全なホスト検証がありません。");
requireCheck(imports.includes("同じ内容のファイルはすでに取り込まれています"), "重複ファイル防止がありません。");
requireCheck(imports.includes('item_matching_status !== "confirmed"'), "商品対応の人による確定前に取込を止めていません。");
requireCheck(imports.includes("generateDemandActionPlan(storeId)"), "取込後の需要予測・在庫アラート再計算がありません。");
requireCheck(imports.includes("assertImportWriteAccess"), "取込更新権限の検証がありません。");
requireCheck(imports.includes("retryErrorsOnly"), "エラー行だけの再実行がありません。");

console.log("Inventory, order, sales import, idempotency, authorization, and recalculation checks passed.");
