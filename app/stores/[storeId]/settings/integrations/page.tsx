import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStoreAccountingIntegration, getStorePaymentIntegration } from "@/lib/phase6/compliance-data";
import { integrationStatusLabels, labelFor } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";

export default async function StoreIntegrationsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [stripe, freee] = await Promise.all([
    getStorePaymentIntegration(store.id, "stripe"),
    getStoreAccountingIntegration(store.id, "freee")
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="店舗外部連携"
        description="店舗で利用する決済URL、会計CSV、Google連携などを管理します。"
      />
      <StoreBusinessNav store={store} />
      <p className="notice success">外部連携情報を整えると、AIOが請求・入金・会計・集客導線をひとつの店舗データとして扱いやすくなります。</p>
      <section className="grid cols-3">
        <article className="card">
          <h3>Stripe決済連携</h3>
          <p>請求書ごとのStripe決済URL、手動入金反映、外部決済履歴を管理します。</p>
          <p><span className="badge">{labelFor(integrationStatusLabels, stripe?.status)}</span></p>
          <Link className="button secondary" href={`/stores/${store.id}/settings/payments/stripe`}>設定する</Link>
        </article>
        <article className="card">
          <h3>freee会計連携</h3>
          <p>freee事業所情報と、freee向けCSV出力を管理します。</p>
          <p><span className="badge">{labelFor(integrationStatusLabels, freee?.status)}</span></p>
          <Link className="button secondary" href={`/stores/${store.id}/settings/accounting/freee`}>設定する</Link>
        </article>
        <article className="card">
          <h3>利用プラン</h3>
          <p>契約中のプランや利用上限は、設定画面で確認できます。</p>
          <Link className="button secondary" href="/settings">設定を確認</Link>
        </article>
      </section>
    </AppShell>
  );
}
