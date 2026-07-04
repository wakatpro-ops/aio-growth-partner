import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listAiRecommendations, listMarketingDrafts } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";

function marketingLabels(industryKey: string) {
  return industryKey === "auto_repair"
    ? { draft: "整備投稿下書き", stock: "部品在庫", customer: "顧客・車両", focus: "整備・点検・安全性" }
    : { draft: "投稿下書き", stock: "商品在庫", customer: "顧客", focus: "商品・サービス・来店促進" };
}

export default async function MarketingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "marketing_drafts")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const labels = marketingLabels(store.industry_type_key);
  const [drafts, recommendations] = await Promise.all([
    listMarketingDrafts(store.id),
    listAiRecommendations(store.id)
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="AI集客"
        description={`${labels.focus}を軸に、業務データから次の発信内容を作ります。`}
      />
      <StoreBusinessNav store={store} />

      <section className="grid cols-3">
        <article className="card">
          <p className="muted">{labels.draft}</p>
          <div className="metric">{drafts.length.toLocaleString("ja-JP")}件</div>
          <p>{labels.stock}や月次レポートをもとに投稿案を保存します。</p>
          <Link className="button" href={`/stores/${store.id}/marketing/drafts`}>下書きを見る</Link>
        </article>
        <article className="card">
          <p className="muted">AI改善提案</p>
          <div className="metric">{recommendations.length.toLocaleString("ja-JP")}件</div>
          <p>売上、在庫、{labels.customer}の状況から来月の打ち手を整理します。</p>
          <Link className="button" href={`/stores/${store.id}/marketing/recommendations`}>提案を見る</Link>
        </article>
        <article className="card">
          <p className="muted">投稿カレンダー</p>
          <div className="metric">設計中</div>
          <p>Phase 3では下書き管理まで実装し、配信予定管理へ拡張できる状態にします。</p>
          <Link className="button secondary" href={`/stores/${store.id}/marketing/calendar`}>予定を見る</Link>
        </article>
      </section>
    </AppShell>
  );
}
