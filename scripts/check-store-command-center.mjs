import fs from "node:fs";

const files = {
  page: fs.readFileSync("app/stores/[storeId]/page.tsx", "utf8"),
  aio: fs.readFileSync("app/stores/[storeId]/aio-improvement/page.tsx", "utf8"),
  component: fs.readFileSync("components/dashboard/store-command-center.tsx", "utf8"),
  data: fs.readFileSync("lib/store-command-center.ts", "utf8"),
  css: fs.readFileSync("app/globals.css", "utf8")
};

const checks = [
  ["店舗トップが経営司令塔を使う", files.page.includes("StoreCommandCenterView")],
  ["店舗トップからAIO準備度パネルを除外", !files.page.includes("StoreAiReadinessPanel") && !files.page.includes("getAioImprovementWorkspace")],
  ["売上は実データから取得", files.data.includes("getSalesReport") && files.data.includes("normalized") === false],
  ["在庫・口コミ・SNSを店舗別に集約", files.data.includes("listInventoryStocks") && files.data.includes("getGoogleIntegrationState") && files.data.includes("listGrowthActions")],
  ["業種別トピックスあり", ["restaurant", "beauty_salon", "retail"].every((key) => files.data.includes(`${key}:`))],
  ["初期設定の役割分担に応じて表示を最適化", files.data.includes("normalizeOperatingModel") && files.data.includes("enabledAreas") && files.component.includes("dashboard.enabledAreas")],
  ["未取得データを明示", files.data.includes('value: "未取得"') && files.component.includes("データ待ち")],
  ["スコアの意味を明記", files.component.includes("経営成績ではありません") && files.component.includes("確認度の内訳")],
  ["実データ推移グラフあり", files.component.includes("command-sparkline") && files.component.includes("実データの推移")],
  ["今日やることが操作導線を持つ", files.component.includes("今日やること") && files.component.includes("task.actionLabel") && files.component.includes("task.href")],
  ["AIO固有情報をAIO改善へ集約", files.aio.includes("AIO改善の専門エリア") && files.aio.includes(`/results`) && files.aio.includes("想定される質問")],
  ["レスポンシブ対応", files.css.includes(".command-layout") && files.css.includes("@media (max-width: 680px)")]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (failed.length) process.exit(1);
console.log(`店舗トップ経営司令塔チェック: ${checks.length}/${checks.length} PASS`);
