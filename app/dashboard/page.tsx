import Link from "next/link";
import { IndustryDashboard } from "@/components/dashboard/industry-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { planForKey, storeDataModeLabel } from "@/lib/mvp/status";
import { getMvpWorkspaceSummary } from "@/lib/stores";

export default async function DashboardPage() {
  const summary = await getMvpWorkspaceSummary();
  const store = summary.productionStores[0] ?? summary.stores[0];
  const industry = getIndustryConfig(store.industry_type_key);
  const plan = planForKey(summary.planKey);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.dashboardTitle}
        description={`${store.name} の業態設定に合わせて、表示カードと機能が切り替わります。`}
        action={<Link className="button" href="/onboarding">初回導入を確認</Link>}
      />
      <section className="grid cols-3">
        <article className="card">
          <p className="muted">データ区分</p>
          <h2>{storeDataModeLabel(store)}</h2>
          <p>確認用店舗と実際に運用する店舗を分けて管理できます。</p>
        </article>
        <article className="card">
          <p className="muted">現在のプラン</p>
          <h2>{plan.name}</h2>
          <p>店舗 {summary.productionStores.length} / {plan.limits.stores}、AI {summary.counts.aiLogs} / {plan.limits.aiGenerations}</p>
        </article>
        <article className="card">
          <p className="muted">次の一手</p>
          <h2>初期設定</h2>
          <p>請求書設定、Google接続、商品・顧客の順に整えるとスムーズです。</p>
        </article>
      </section>
      <IndustryDashboard store={store} />
    </AppShell>
  );
}
