import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";

export default async function SalesHubPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const groups = [
    { title: "見積・請求・領収", body: "作成から入金確認までをまとめて進めます。", links: [
      [industry.businessLabels.estimate, `/stores/${store.id}/estimates`],
      [industry.businessLabels.invoice, `/stores/${store.id}/invoices`],
      ["領収・入金記録", `/stores/${store.id}/payments`]
    ] },
    { title: "売上を確認", body: "売上データ、月次の傾向、需要予測を確認します。", links: [
      ["売上データ", `/stores/${store.id}/sales`],
      ["月次レポート", `/stores/${store.id}/reports/monthly`],
      ["AI売上レポート", `/stores/${store.id}/sales/reports/monthly-ai`]
    ] },
    { title: "売上の基本情報", body: "商品・サービスと顧客を管理します。", links: [
      [industry.businessLabels.item, `/stores/${store.id}/items`],
      [industry.businessLabels.customer, `/stores/${store.id}/customers`],
      ["売上データ取込", `/stores/${store.id}/data-imports`]
    ] }
  ];
  return (
    <AppShell>
      <PageHeader eyebrow="売上" title="売上と書類" description="見積・請求・領収に使う入金記録、売上確認、基本情報を3つに整理しています。" />
      <StoreBusinessNav store={store} />
      <section className="hub-grid">
        {groups.map((group) => (
          <article className="static-card" key={group.title}>
            <h2>{group.title}</h2><p>{group.body}</p>
            <div className="stacked-links">
              {group.links.map(([label, href]) => <Link href={href} key={href}><span>{label}</span><b>開く →</b></Link>)}
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
