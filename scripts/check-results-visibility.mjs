import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/202608160001_results_visibility.sql", "utf8");
const service = readFileSync("lib/results-visibility.ts", "utf8");
const page = readFileSync("app/stores/[storeId]/results/page.tsx", "utf8");
const actions = readFileSync("app/stores/[storeId]/results/actions.ts", "utf8");
const cron = readFileSync("app/api/cron/search-visibility/route.ts", "utf8");
const googleIntegration = readFileSync("lib/phase5/google-integrations.ts", "utf8");
const storeTop = readFileSync("app/stores/[storeId]/page.tsx", "utf8");

for (const table of ["search_visibility_settings", "search_visibility_keywords", "search_visibility_snapshots"]) {
  if (!migration.includes(`create table if not exists public.${table}`)) throw new Error(`${table} is missing`);
  if (!migration.includes(`alter table public.${table} enable row level security`)) throw new Error(`${table} does not enable RLS`);
}

for (const label of ["成果を見る", "Google検索での変化", "Googleマップでの反応", "AIでの見つかり方", "平均掲載順位", "順位保証ではなく、実測値の推移"]) {
  if (!page.includes(label)) throw new Error(`Results UI is missing: ${label}`);
}

for (const lifecycle of ["addSearchVisibilityKeywordFromForm", "archiveSearchVisibilityKeyword", "restoreSearchVisibilityKeyword"]) {
  if (!service.includes(lifecycle)) throw new Error(`Keyword lifecycle is missing: ${lifecycle}`);
}

for (const integration of ["searchAnalytics/query", "syncDueSearchConsoleStores", "dataState: \"final\""]) {
  if (!service.includes(integration)) throw new Error(`Search Console integration is missing: ${integration}`);
}
if (!googleIntegration.includes("webmasters.readonly")) throw new Error("Search Console read-only OAuth scope is missing");

if (!cron.includes("CRON_SECRET") || !actions.includes("syncSearchConsoleAction")) throw new Error("Manual or scheduled sync is missing");
if (!storeTop.includes("/results") || !storeTop.includes("実測成果")) throw new Error("Store top result entry is missing");
if (page.includes("現在8位") || page.includes("必ず上位")) throw new Error("Unsafe fixed ranking claim found");

console.log("Results visibility coverage checks passed.");
