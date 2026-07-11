import Link from "next/link";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";

export function StoreBusinessNav({ store }: { store: Store }) {
  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);
  const links = [
    { href: `/stores/${store.id}`, label: "店舗トップ", feature: "__always_on" },
    { href: `/stores/${store.id}/items`, label: industry.businessLabels.item, feature: "product_management" },
    { href: `/stores/${store.id}/inventory`, label: industry.businessLabels.stock, feature: "inventory_management" },
    { href: `/stores/${store.id}/customers`, label: industry.businessLabels.customer, feature: "customer_management" },
    { href: `/stores/${store.id}/estimates`, label: industry.businessLabels.estimate, feature: "estimate_management" },
    { href: `/stores/${store.id}/invoices`, label: industry.businessLabels.invoice, feature: "invoice_management" },
    { href: `/stores/${store.id}/orders`, label: "受注・作業", feature: "order_workflow" },
    { href: `/stores/${store.id}/payments`, label: "入金管理", feature: "payment_management" },
    { href: `/stores/${store.id}/payments/stripe-transactions`, label: "Stripe履歴", feature: "manual_stripe_payment_links" },
    { href: `/stores/${store.id}/accounting/exports`, label: "会計CSV", feature: "accounting_csv_export" },
    { href: `/stores/${store.id}/settings`, label: "店舗AI設定", feature: "__always_on" },
    { href: `/stores/${store.id}/settings/integrations`, label: "外部連携", feature: "store_integrations" },
    { href: `/stores/${store.id}/settings/invoice`, label: "請求書設定", feature: "invoice_compliance" },
    { href: `/stores/${store.id}/audit-logs`, label: "証跡ログ", feature: "audit_logs" },
    { href: `/stores/${store.id}/reports/subsidy-impact`, label: "導入効果", feature: "subsidy_impact_report" },
    { href: `/stores/${store.id}/compliance/invoice-tool-map`, label: "機能マップ", feature: "invoice_tool_map" },
    { href: `/stores/${store.id}/reports/monthly`, label: "月次レポート", feature: "monthly_report" },
    { href: `/stores/${store.id}/marketing`, label: "AI集客", feature: "marketing_drafts" },
    { href: `/stores/${store.id}/data-imports`, label: "データ取込", feature: "data_imports" },
    { href: `/stores/${store.id}/sales`, label: "売上データ", feature: "sales_reports" },
    { href: `/stores/${store.id}/sales/reports/monthly-ai`, label: "AI月次売上", feature: "sales_ai_report" },
    { href: `/stores/${store.id}/sales/forecast`, label: "需要予測", feature: "demand_forecast" },
    { href: `/stores/${store.id}/inventory/alerts`, label: "在庫アラート", feature: "inventory_alerts" },
    { href: `/stores/${store.id}/actions`, label: "次アクション", feature: "recommended_actions" },
    { href: `/stores/${store.id}/growth-actions`, label: "集客アクション", feature: "growth_action_center" },
    { href: `/stores/${store.id}/growth-calendar`, label: "集客カレンダー", feature: "growth_calendar" },
    { href: `/stores/${store.id}/settings/channels`, label: "チャネル設定", feature: "external_channel_accounts" },
    { href: `/stores/${store.id}/settings/google`, label: "Google連携", feature: "google_integrations" }
  ].filter((link) => link.feature === "__always_on" || isFeatureEnabled(flags, link.feature));

  return (
    <nav className="quick-nav" aria-label="店舗内メニュー">
      <span className="quick-nav-label">店舗内メニュー</span>
      <div className="quick-nav-links">
        {links.map((link) => (
          <Link key={link.href} className="button secondary" href={link.href}>{link.label}</Link>
        ))}
      </div>
    </nav>
  );
}
