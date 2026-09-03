import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/202608220001_unified_ai_import.sql", "utf8");
const policies = readFileSync("database/policies.sql", "utf8");
const service = readFileSync("lib/unified-import/data.ts", "utf8");
const parser = readFileSync("lib/unified-import/parser.ts", "utf8");
const detail = readFileSync("app/stores/[storeId]/data-imports/ai/[jobId]/page.tsx", "utf8");
const uploadPage = readFileSync("app/stores/[storeId]/data-imports/ai/page.tsx", "utf8");
const uploadForm = readFileSync("components/unified-import/import-upload-form.tsx", "utf8");
const mappingReview = readFileSync("components/unified-import/mapping-review-panel.tsx", "utf8");

for (const table of ["unified_import_jobs", "unified_import_rows"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(policies, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migration, /read org unified import jobs[\s\S]*is_org_member/);
assert.match(migration, /write org unified import jobs[\s\S]*is_org_editor/);
assert.match(migration, /write org unified import rows[\s\S]*is_org_editor/);
assert.match(migration, /unified_import_rows_job_parent_fk/);
assert.match(migration, /stores\.id = unified_import_jobs\.store_id/);
assert.match(migration, /jobs\.organization_id = unified_import_rows\.organization_id/);
assert.match(service, /getCurrentUserAccess/);
assert.match(service, /if \(write && !access\.isPlatformAdmin && !editableRoles\.has\(role\)\)/);
assert.match(service, /detail\.job\.status !== "review_ready"|\["review_ready", "partial_failed", "failed"\]/);
assert.match(service, /freee_status: "review_required"/);
assert.doesNotMatch(service, /openai|chat\.completions|responses\.create/i, "顧客の生データを外部AIへ送信してはいけません。");
assert.match(parser, /bookVBA: false/);
assert.match(parser, /cellFormula: false/);
assert.match(detail, /確認した内容で取り込みを確定/);
assert.match(detail, /マクロは実行せず/);
assert.match(detail, /保存先ごとの整理結果/);
assert.match(detail, /同じ内容の行候補/);
assert.match(uploadPage, /ImportUploadForm/);
assert.match(uploadForm, /onDrop/);
assert.match(uploadForm, /表とシートの構造を確認しています/);
assert.match(mappingReview, /元ファイルの表/);
assert.match(mappingReview, /自動で整理した/);
assert.match(service, /reuseStoreMappings/);
assert.match(service, /mapping_reused_sheets/);
for (const route of [
  "app/stores/[storeId]/data-imports/ai/page.tsx",
  "app/stores/[storeId]/data-imports/ai/[jobId]/page.tsx",
  "app/stores/[storeId]/data-imports/ai/actions.ts"
]) assert.ok(existsSync(route), `AI共通取込の画面またはActionが不足しています: ${route}`);

console.log("Unified import workflow, review gate, privacy, and authorization checks passed.");
