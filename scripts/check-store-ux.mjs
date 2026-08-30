import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const appFiles = globSync("{app,components}/**/*.{ts,tsx}");
const visibleArchiveTerms = [];
for (const file of appFiles) {
  const source = readFileSync(file, "utf8");
  if (source.includes("アーカイブ")) visibleArchiveTerms.push(file);
}

const horizontalNav = readFileSync("components/phase2/store-business-nav.tsx", "utf8");
const sidebar = readFileSync("components/layout/app-shell.tsx", "utf8");
const settingsPage = readFileSync("app/stores/[storeId]/settings/page.tsx", "utf8");
const acquisitionPage = readFileSync("app/stores/[storeId]/acquisition/page.tsx", "utf8");
const dashboardPage = readFileSync("app/dashboard/page.tsx", "utf8");
const noStorePage = readFileSync("app/no-store/page.tsx", "utf8");
const storeSummaryRoute = readFileSync("app/api/stores/[storeId]/summary/route.ts", "utf8");
const requiredAreas = ["店舗トップ", "AIO改善", "売上", "在庫・仕入", "データ取り込み", "設定"];
const missingAreas = requiredAreas.filter((label) => !sidebar.includes(`label: \"${label}\"`));
const duplicateHorizontalNav = /store-area-nav|store-area-link/u.test(horizontalNav);
const obsoleteAcquisitionNav = sidebar.includes('label: "集客"');
const duplicatedReadiness = /StoreAi(ReadinessPanel|NextActions|LearnedFeedback)/u.test(settingsPage);
const missingAcquisitionRedirect = !/redirect\(`\/stores\/\$\{storeId\}\/settings`\)/u.test(acquisitionPage);
const dashboardStillRendersContent = /IndustryDashboard|StoreAiReadinessPanel|PageHeader/u.test(dashboardPage);
const missingStoreSwitcher = !/sidebar_store_switcher/u.test(sidebar) || !/handleStoreChange/u.test(sidebar);
const obsoleteDashboardHome = sidebar.includes('href: "/dashboard", label: "ホーム"');
const missingNoStoreState = !/利用できる店舗がまだありません/u.test(noStorePage);
const missingLastStorePreference = !/aio_last_store_id/u.test(storeSummaryRoute);

if (visibleArchiveTerms.length || missingAreas.length || duplicateHorizontalNav || obsoleteAcquisitionNav || duplicatedReadiness || missingAcquisitionRedirect || dashboardStillRendersContent || missingStoreSwitcher || obsoleteDashboardHome || missingNoStoreState || missingLastStorePreference) {
  if (visibleArchiveTerms.length) console.error(`利用者向け画面に「アーカイブ」が残っています: ${visibleArchiveTerms.join(", ")}`);
  if (missingAreas.length) console.error(`主要メニューが不足しています: ${missingAreas.join(", ")}`);
  if (duplicateHorizontalNav) console.error("重複する横長の店舗主要ナビが残っています。");
  if (obsoleteAcquisitionNav) console.error("廃止した集客ハブへのサイドバー導線が残っています。");
  if (duplicatedReadiness) console.error("設定ページにAIO改善の重複ブロックが残っています。");
  if (missingAcquisitionRedirect) console.error("旧集客URLから設定への互換リダイレクトがありません。");
  if (dashboardStillRendersContent) console.error("/dashboardに店舗画面と重複する表示が残っています。");
  if (missingStoreSwitcher) console.error("サイドバーに店舗切り替えがありません。");
  if (obsoleteDashboardHome) console.error("表示ページではなくなった/dashboardがホーム導線に残っています。");
  if (missingNoStoreState) console.error("担当店舗がない利用者向けの明示画面がありません。");
  if (missingLastStorePreference) console.error("最後に利用した店舗を記録する仕組みがありません。");
  process.exit(1);
}

console.log("Store UX checks passed.");
