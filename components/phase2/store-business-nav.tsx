import Link from "next/link";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";

export function StoreBusinessNav({ store }: { store: Store }) {
  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);
  const links = [
    { href: `/stores/${store.id}/items`, label: industry.businessLabels.item, feature: "product_management" },
    { href: `/stores/${store.id}/inventory`, label: industry.businessLabels.stock, feature: "inventory_management" },
    { href: `/stores/${store.id}/customers`, label: industry.businessLabels.customer, feature: "customer_management" },
    { href: `/stores/${store.id}/estimates`, label: industry.businessLabels.estimate, feature: "estimate_management" },
    { href: `/stores/${store.id}/invoices`, label: industry.businessLabels.invoice, feature: "invoice_management" },
    { href: `/stores/${store.id}/reports/monthly`, label: "月次レポート", feature: "monthly_report" }
  ].filter((link) => isFeatureEnabled(flags, link.feature));

  return (
    <div className="quick-nav">
      {links.map((link) => (
        <Link key={link.href} className="button secondary" href={link.href}>{link.label}</Link>
      ))}
    </div>
  );
}
