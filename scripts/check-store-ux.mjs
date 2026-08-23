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
const requiredAreas = ["店舗トップ", "AIO改善", "売上", "データ取り込み", "設定"];
const missingAreas = requiredAreas.filter((label) => !sidebar.includes(`label: \"${label}\"`));
const duplicateHorizontalNav = /store-area-nav|store-area-link/u.test(horizontalNav);
const obsoleteAcquisitionNav = sidebar.includes('label: "集客"');
const duplicatedReadiness = /StoreAi(ReadinessPanel|NextActions|LearnedFeedback)/u.test(settingsPage);
const missingAcquisitionRedirect = !/redirect\(`\/stores\/\$\{storeId\}\/settings`\)/u.test(acquisitionPage);

if (visibleArchiveTerms.length || missingAreas.length || duplicateHorizontalNav || obsoleteAcquisitionNav || duplicatedReadiness || missingAcquisitionRedirect) {
  if (visibleArchiveTerms.length) console.error(`利用者向け画面に「アーカイブ」が残っています: ${visibleArchiveTerms.join(", ")}`);
  if (missingAreas.length) console.error(`主要メニューが不足しています: ${missingAreas.join(", ")}`);
  if (duplicateHorizontalNav) console.error("重複する横長の店舗主要ナビが残っています。");
  if (obsoleteAcquisitionNav) console.error("廃止した集客ハブへのサイドバー導線が残っています。");
  if (duplicatedReadiness) console.error("設定ページにAIO改善の重複ブロックが残っています。");
  if (missingAcquisitionRedirect) console.error("旧集客URLから設定への互換リダイレクトがありません。");
  process.exit(1);
}

console.log("Store UX checks passed.");
