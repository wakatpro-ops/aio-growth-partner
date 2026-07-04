import Link from "next/link";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";

export function StoreBusinessNav({ store }: { store: Store }) {
  const flags = resolveFeatureFlags(store);
  const links = [
    { href: `/stores/${store.id}/items`, label: "商品・部品・サービス", feature: "product_management" },
    { href: `/stores/${store.id}/inventory`, label: "在庫", feature: "inventory_management" },
    { href: `/stores/${store.id}/customers`, label: "顧客", feature: "customer_management" },
    { href: `/stores/${store.id}/estimates`, label: "見積書", feature: "estimate_management" },
    { href: `/stores/${store.id}/invoices`, label: "請求書", feature: "invoice_management" }
  ].filter((link) => isFeatureEnabled(flags, link.feature));

  return (
    <div className="quick-nav">
      {links.map((link) => (
        <Link key={link.href} className="button secondary" href={link.href}>{link.label}</Link>
      ))}
    </div>
  );
}
