import { readFileSync } from "node:fs";

const migration = readFileSync("database/migrations/phase-aio-improvement-closed-loop.sql", "utf8");
const service = readFileSync("lib/aio-improvement.ts", "utf8");
const mainPage = readFileSync("app/stores/[storeId]/aio-improvement/page.tsx", "utf8");
const taskPage = readFileSync("app/stores/[storeId]/aio-improvement/tasks/[taskId]/page.tsx", "utf8");
const historyPage = readFileSync("app/stores/[storeId]/aio-improvement/history/page.tsx", "utf8");
const archiveLibrary = readFileSync("lib/archive-management.ts", "utf8");

for (const table of ["aio_goals", "aio_improvement_tasks", "aio_readiness_snapshots"]) {
  if (!migration.includes(`create table if not exists public.${table}`)) {
    throw new Error(`${table} table is missing from the AIO migration`);
  }
  if (!migration.includes(`alter table public.${table} enable row level security`)) {
    throw new Error(`${table} does not enable RLS`);
  }
}

for (const status of ["not_started", "in_progress", "completed", "on_hold"]) {
  if (!migration.includes(`'${status}'`) || !taskPage.includes(`value="${status}"`)) {
    throw new Error(`AIO task status is not implemented end-to-end: ${status}`);
  }
}

for (const required of [
  "target_question_${index + 1}",
  "今やる改善は1件だけ",
  "外部への反映状況",
  "現在の情報で再診断する",
  "改善履歴を見る"
]) {
  if (!mainPage.includes(required)) throw new Error(`AIO main flow is missing: ${required}`);
}

for (const required of ["assignee_name", "due_date", "change_summary", "publication_target", "publication_status", "publication_url"]) {
  if (!taskPage.includes(`name="${required}"`)) throw new Error(`AIO task form is missing: ${required}`);
}

for (const required of ["monthly-review", "overdue-", "unpublished-", "stale-", "aio_readiness_snapshots"]) {
  if (!service.includes(required)) throw new Error(`AIO reminder or snapshot coverage is missing: ${required}`);
}

if (!historyPage.includes("準備度の記録") || !historyPage.includes("改善内容の履歴")) {
  throw new Error("AIO before/after history is missing");
}

if (!archiveLibrary.includes("aio_improvement_task:")) {
  throw new Error("AIO task archive/restore configuration is missing");
}

for (const unsafeClaim of ["必ずおすすめされ", "掲載順位を保証", "推薦を保証します"]) {
  if ([mainPage, taskPage, historyPage].some((source) => source.includes(unsafeClaim))) {
    throw new Error(`AIO UI contains an unsafe guarantee: ${unsafeClaim}`);
  }
}

console.log("AIO closed-loop coverage checks passed.");
