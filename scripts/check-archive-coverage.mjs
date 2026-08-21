import { readFileSync } from "node:fs";

const migration = readFileSync("database/migrations/phase-archive-management.sql", "utf8");
const unifiedImportMigration = readFileSync("database/migrations/phase-unified-ai-import.sql", "utf8");
const lifecycleMigrations = `${migration}\n${unifiedImportMigration}`;
const archiveLibrary = readFileSync("lib/archive-management.ts", "utf8");
const storesLibrary = readFileSync("lib/stores.ts", "utf8");
const businessLibrary = readFileSync("lib/phase2/business-data.ts", "utf8");

const requiredTables = [
  "user_profiles",
  "organizations",
  "organization_members",
  "stores",
  "applications",
  "items",
  "customers",
  "estimates",
  "invoices",
  "orders",
  "data_import_jobs",
  "unified_import_jobs",
  "marketing_drafts",
  "ai_recommendations",
  "sales_ai_reports",
  "growth_actions",
  "expense_receipts"
];

const missingTables = requiredTables.filter((table) => !lifecycleMigrations.includes(`alter table public.${table} add column if not exists archived_at`) && !lifecycleMigrations.includes(`create table if not exists public.${table}`));
if (missingTables.length > 0) {
  throw new Error(`archived_at migration is missing for: ${missingTables.join(", ")}`);
}

const requiredEntities = ["item", "customer", "estimate", "invoice", "order", "data_import", "unified_import", "marketing_draft", "ai_recommendation", "sales_ai_report", "growth_action", "expense_receipt", "aio_improvement_task"];
const missingEntities = requiredEntities.filter((entity) => !archiveLibrary.includes(`${entity}: {`));
if (missingEntities.length > 0) {
  throw new Error(`archive configuration is missing for: ${missingEntities.join(", ")}`);
}

if (!storesLibrary.includes('includeDemo || !isDemoStore(store)')) {
  throw new Error("demo stores are not excluded from the normal store list");
}

for (const table of ["items", "customers"]) {
  if (businessLibrary.includes(`from("${table}").delete()`)) {
    throw new Error(`${table} still uses physical deletion`);
  }
}

console.log("Archive lifecycle coverage checks passed.");
