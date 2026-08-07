import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const appFiles = globSync("{app,components}/**/*.{ts,tsx}");
const visibleArchiveTerms = [];
for (const file of appFiles) {
  const source = readFileSync(file, "utf8");
  if (source.includes("アーカイブ")) visibleArchiveTerms.push(file);
}

const nav = readFileSync("components/phase2/store-business-nav.tsx", "utf8");
const requiredAreas = ["店舗トップ", "AIO改善", "集客", "売上", "設定"];
const missingAreas = requiredAreas.filter((label) => !nav.includes(`label: \"${label}\"`));

if (visibleArchiveTerms.length || missingAreas.length) {
  if (visibleArchiveTerms.length) console.error(`利用者向け画面に「アーカイブ」が残っています: ${visibleArchiveTerms.join(", ")}`);
  if (missingAreas.length) console.error(`主要メニューが不足しています: ${missingAreas.join(", ")}`);
  process.exit(1);
}

console.log("Store UX checks passed.");
