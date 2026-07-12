import Link from "next/link";
import { IndustryDashboard } from "@/components/dashboard/industry-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import {
  StoreAiDataStatus,
  StoreAiLearnedFeedback,
  StoreAiNextActions,
  StoreAiReadinessPanel
} from "@/components/store-ai/store-ai-readiness-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { planForKey, storeDataModeLabel } from "@/lib/mvp/status";
import { getMvpWorkspaceSummary } from "@/lib/stores";
import { getStoreAiReadiness } from "@/lib/store-ai/readiness";

export default async function DashboardPage() {
  const summary = await getMvpWorkspaceSummary();
  const store = summary.productionStores[0] ?? summary.stores[0];
  if (!store) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="利用開始準備"
          title="店舗の準備を確認しています"
          description="利用できる店舗がまだ紐づいていません。担当者からの案内に沿って、初回設定を進めてください。"
          action={<Link className="button" href="/onboarding">初回導入を確認</Link>}
        />
        <section className="card">
          <h2>店舗がまだ準備中です</h2>
          <p>店舗情報の反映が完了すると、ここに店舗AI理解度、次に整える情報、売上・集客のおすすめが表示されます。</p>
          <div className="button-row">
            <Link className="button secondary" href="/onboarding">初回導入へ</Link>
            <Link className="button secondary" href="/help">操作方法を見る</Link>
          </div>
        </section>
      </AppShell>
    );
  }
  const industry = getIndustryConfig(store.industry_type_key);
  const plan = planForKey(summary.planKey);
  const readiness = await getStoreAiReadiness(store);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="経営の次の一手"
        description={`${store.name} の店舗データをもとに、今整えると効果が高い情報と次のアクションを表示します。`}
        action={<Link className="button" href="/onboarding">初回導入を確認</Link>}
      />
      <StoreAiReadinessPanel readiness={readiness} storeId={store.id} />
      <StoreAiNextActions readiness={readiness} />
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
          <p className="muted">今月の注目ポイント</p>
          <h2>{readiness.nextBestActions[0]?.label ?? "改善提案"}</h2>
          <p>{readiness.nextBestActions[0]?.benefit ?? "集まった店舗データから、投稿・請求・売上の次アクションを確認できます。"}</p>
        </article>
      </section>
      <section className="grid cols-2">
        <StoreAiDataStatus readiness={readiness} />
        <StoreAiLearnedFeedback readiness={readiness} />
      </section>
      <IndustryDashboard store={store} />
    </AppShell>
  );
}
