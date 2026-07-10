import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStoreAccountingIntegration, getStorePaymentIntegration } from "@/lib/phase6/compliance-data";
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
        description="店舗自身のStripe/freee連携を管理します。AIO運営側の月額課金とは別物です。"
      />
      <StoreBusinessNav store={store} />
      <p className="notice">AIO運営会社のStripe/freeeではなく、この店舗が自分で使うStripeアカウント・freee事業所を扱います。</p>
      <section className="grid cols-3">
        <article className="card">
          <h3>Stripe決済連携</h3>
          <p>請求書ごとのStripe決済URL、手動入金反映、外部決済履歴を管理します。</p>
          <p><span className="badge">{stripe?.status ?? "not_connected"}</span></p>
          <Link className="button secondary" href={`/stores/${store.id}/settings/payments/stripe`}>設定する</Link>
        </article>
        <article className="card">
          <h3>freee会計連携</h3>
          <p>freee事業所情報と、freee向けCSV出力を管理します。API送信は次フェーズです。</p>
          <p><span className="badge">{freee?.status ?? "not_connected"}</span></p>
          <Link className="button secondary" href={`/stores/${store.id}/settings/accounting/freee`}>設定する</Link>
        </article>
        <article className="card">
          <h3>AIO運営側課金</h3>
          <p>AIO利用料はMVP期間中、請求書ベースで運用します。店舗決済とは分離します。</p>
          <Link className="button secondary" href="/admin/billing-integrations">分離を確認</Link>
        </article>
      </section>
    </AppShell>
  );
}
