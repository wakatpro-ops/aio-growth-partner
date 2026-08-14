import { existsSync, readFileSync } from "node:fs";

const migration = readFileSync("database/migrations/phase-customer-crm-import.sql", "utf8");
const schema = readFileSync("database/schema.sql", "utf8");
const policies = readFileSync("database/policies.sql", "utf8");
const service = readFileSync("lib/customer-crm.ts", "utf8");
const archiveLibrary = readFileSync("lib/archive-management.ts", "utf8");

const requiredCustomerFields = [
  "birth_date",
  "gender",
  "occupation",
  "assigned_staff_name",
  "line_account",
  "instagram_account",
  "facebook_account",
  "last_visit_date",
  "visit_count",
  "email_opt_in",
  "line_opt_in",
  "social_opt_in",
  "do_not_contact"
];

const requiredTables = ["customer_notes", "customer_import_jobs", "customer_message_drafts"];
const requiredRoutes = [
  "app/stores/[storeId]/customers/import/page.tsx",
  "app/stores/[storeId]/customers/import/[importJobId]/page.tsx",
  "app/stores/[storeId]/customers/import/template/route.ts",
  "app/stores/[storeId]/customer-segments/page.tsx",
  "app/stores/[storeId]/customer-messages/page.tsx",
  "app/stores/[storeId]/customer-messages/[messageId]/page.tsx"
];

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

for (const field of requiredCustomerFields) {
  requireCheck(migration.includes(`add column if not exists ${field}`), `顧客項目のmigrationが不足しています: ${field}`);
}

for (const table of requiredTables) {
  requireCheck(migration.includes(`create table if not exists public.${table}`), `顧客CRMテーブルが不足しています: ${table}`);
  requireCheck(migration.includes(`alter table public.${table} enable row level security`), `RLSが不足しています: ${table}`);
  requireCheck(policies.includes(`alter table public.${table} enable row level security`), `統合policy定義のRLSが不足しています: ${table}`);
}

for (const route of requiredRoutes) {
  requireCheck(existsSync(route), `顧客CRM画面が不足しています: ${route}`);
}

for (const entity of ["customer_note", "customer_import", "customer_message"]) {
  requireCheck(archiveLibrary.includes(`${entity}: {`), `削除・復元設定が不足しています: ${entity}`);
}

requireCheck(service.includes('raw_rows: []'), "取込完了後に一時保存した生データを消去していません。");
requireCheck(service.includes("顧客名、電話番号、メールアドレス、会話メモはAIへ送信していません"), "AIへ個人情報を送らない明示的な防止策が不足しています。");
requireCheck(service.includes("customerCanReceiveChannel"), "チャネル別の配信許可判定が不足しています。");
requireCheck(service.includes("customer.do_not_contact"), "配信停止顧客の除外処理が不足しています。");
requireCheck(!service.includes('channel === "sms"'), "同意仕様が未定義のSMS配信が含まれています。");

const archiveColumnPosition = schema.indexOf("alter table public.customers add column if not exists archived_at");
const partialIndexPosition = schema.indexOf("customers_store_phone_normalized_idx");
requireCheck(archiveColumnPosition >= 0 && partialIndexPosition > archiveColumnPosition, "fresh schemaでarchived_at追加前に顧客partial indexを作成しています。");

console.log("Customer CRM import, privacy, consent, and lifecycle checks passed.");
