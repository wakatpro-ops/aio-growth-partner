import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { StoreAiNextActions, StoreAiReadinessPanel } from "@/components/store-ai/store-ai-readiness-panel";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { getStoreAiReadiness } from "@/lib/store-ai/readiness";

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const readiness = await getStoreAiReadiness(store);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={`${store.name} 店舗トップ`}
        description="集客、売上、今日やることを、この画面から確認できます。"
      />
      <StoreBusinessNav store={store} />
      <StoreAiReadinessPanel readiness={readiness} storeId={store.id} />

      <section className="home-section">
        <div className="section-heading">
          <div><p className="eyebrow">1. 集客</p><h2>AIから選ばれる店舗へ</h2></div>
          <Link className="text-link" href={`/stores/${store.id}/acquisition`}>集客の全機能を見る →</Link>
        </div>
        <div className="grid cols-2">
          <Link className="hub-link primary" href={`/stores/${store.id}/aio-improvement`}>
            <span className="badge">最優先</span>
            <h3>AIにおすすめされやすくする</h3>
            <p>想定される質問と、今いちばん効果の高い改善を確認します。</p>
            <strong>改善を始める →</strong>
          </Link>
          <article className="static-card">
            <p className="eyebrow">お客様が尋ねる質問の例</p>
            <h3>「{readiness.targetQuestions[0]}」</h3>
            <p>このような質問に対して、店舗の特徴が伝わる情報を整えていきます。</p>
          </article>
        </div>
      </section>

      <section className="home-section">
        <div className="section-heading">
          <div><p className="eyebrow">2. 売上管理</p><h2>書類と売上をまとめて確認</h2></div>
        </div>
        <Link className="hub-link" href={`/stores/${store.id}/sales-hub`}>
          <h3>売上を開く</h3>
          <p>見積書・請求書・領収書に使う入金記録、顧客、商品・サービスを1か所にまとめています。</p>
          <strong>売上管理へ →</strong>
        </Link>
      </section>

      <section className="home-section">
        <p className="eyebrow">3. 今日やること</p>
        <StoreAiNextActions readiness={readiness} />
      </section>
    </AppShell>
  );
}
