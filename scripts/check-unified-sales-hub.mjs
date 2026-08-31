import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const hub = read("app/stores/[storeId]/sales-hub/page.tsx");
const legacy = read("app/stores/[storeId]/sales/reports/page.tsx");
const shell = read("components/layout/app-shell.tsx");
const commandCenter = read("lib/store-command-center.ts");
const dashboard = read("components/dashboard/store-command-center.tsx");
const css = read("app/globals.css");

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(hub.includes("getSalesReport"), "sales-hub must load the sales report data");
for (const label of ["合計売上", "取引件数", "平均取引額", "日別売上", "月別売上", "商品別売上", "支払方法別売上"]) {
  expect(hub.includes(label), `sales-hub is missing ${label}`);
}
for (const route of ["/estimates", "/invoices", "/payments", "/sales`", "/data-imports/ai", "/sales/forecast", "/reports/monthly"]) {
  expect(hub.includes(route), `sales-hub is missing a route containing ${route}`);
}
expect(hub.includes('isFeatureEnabled(flags, "sales_reports")'), "sales report feature flag must be preserved");
expect(hub.includes('isFeatureEnabled(flags, "sales_ai_report")'), "AI sales report feature flag must be preserved");

expect(legacy.includes("redirect("), "legacy sales report page must redirect");
expect(legacy.includes("sales-hub#reports"), "legacy sales report must redirect to the report section");
expect(legacy.includes("notFound()"), "legacy report authorization/feature behavior must be preserved");

expect(shell.includes('label: "売上・レポート"'), "sidebar label must identify the unified destination");
expect(shell.includes("/sales-hub"), "sidebar must link to sales-hub");
expect(!commandCenter.includes("${store.id}/sales/reports`"), "command-center KPI links must not use the legacy report root");
expect(commandCenter.includes("sales-hub#reports"), "command-center KPI links must use the report section");
expect(dashboard.includes("sales-hub#reports"), "dashboard report link must use the report section");

expect(css.includes(".sales-report-grid"), "unified sales report layout styles are missing");
expect(css.includes("@media (max-width: 680px)"), "mobile sales-hub styles are missing");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Unified sales-hub checks passed.");
