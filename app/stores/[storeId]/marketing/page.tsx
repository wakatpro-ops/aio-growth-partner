import Link from "next/link";
import { redirect } from "next/navigation";
import { MarketingSections } from "@/components/marketing/marketing-sections";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { DonutChart } from "@/components/ui/data-visuals";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listAiRecommendations, listMarketingDrafts } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";
import { listGrowthActions } from "@/lib/phase5/growth-actions";
import { StartMarketingConversation } from "@/components/marketing/marketing-assistant";

function marketingLabels(industryKey: string) {
  return industryKey === "auto_repair"
    ? { draft: "整備投稿下書き", stock: "部品在庫", customer: "顧客・車両", focus: "整備・点検・安全性" }
    : { draft: "投稿下書き", stock: "商品在庫", customer: "顧客", focus: "商品・サービス・来店促進" };
}

const draftStatusLabels: Record<string, string> = { draft: "下書き", approved: "確認済み", published: "投稿済み" };
const channelLabels: Record<string, string> = { instagram: "Instagram", google_business_profile: "Google", facebook: "Facebook", line: "LINE" };

export default async function MarketingPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  // AIO improvement remains available even when optional posting features are disabled.
  if (!isFeatureEnabled(flags, "marketing_drafts")) redirect(`/stores/${store.id}/marketing/aio-improvement`);

  const industry = getIndustryConfig(store.industry_type_key);
  const labels = marketingLabels(store.industry_type_key);
  const [legacyDrafts, recommendations, actions] = await Promise.all([
    listMarketingDrafts(store.id),
    listAiRecommendations(store.id),
    listGrowthActions(store.id)
  ]);
  const drafts = [
    ...legacyDrafts.map(draft => ({ ...draft, href: `/stores/${store.id}/marketing/drafts/${draft.id}` })),
    ...actions.filter(action => action.source_type === "guided_conversation").map(action => ({ id: action.id, created_at: action.created_at, channel: action.target_channel, title: action.title,
      status: action.published_at || action.status === "done" ? "published" : action.status === "approved" ? "approved" : "draft",
      body: action.drafts?.[0]?.body ?? action.summary, short_body: "", href: `/stores/${store.id}/growth-actions/${action.id}` }))
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const statusCounts = [...drafts.reduce((counts, draft) => {
    const label = draftStatusLabels[draft.status] ?? draft.status;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())];
  const channelCounts = [...drafts.reduce((counts, draft) => {
    const label = channelLabels[draft.channel] ?? draft.channel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())];

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="集客・販促"
        description={`${labels.focus}の発信と、検索・AIに見つけてもらうための改善をここで進めます。`}
      />
      <StoreBusinessNav store={store} />
      <MarketingSections store={store} active="promotion" />
      <section className="card"><div className="section-heading"><div><h2>何から始めるか、AIと一緒に。</h2><p>お店に合った次の一手をご案内。投稿の下書きも会話から準備できます。</p></div><StartMarketingConversation /></div></section>
      <section className="visual-section">
        <div className="section-heading"><div><p className="eyebrow">投稿の準備状況</p><h2>何を確認すべきか、ひと目で把握</h2></div><p>AIが勝手に公開せず、投稿済みになるまで人が確認します。</p></div>
        <div className="visual-grid cols-2">
          <DonutChart title="投稿の状態" centerLabel="下書き合計" centerValue={`${drafts.length}件`} data={statusCounts.map(([label, value]) => ({ label, value, displayValue: `${value}件` }))} emptyMessage="投稿下書きを作成すると、確認状況を表示できます。" />
          <DonutChart title="投稿先" centerLabel="媒体数" centerValue={`${channelCounts.length}種類`} data={channelCounts.map(([label, value]) => ({ label, value, displayValue: `${value}件` }))} emptyMessage="投稿下書きを作成すると、媒体ごとの内訳を表示できます。" />
        </div>
        {drafts.length ? <div className="marketing-preview-grid">
          {drafts.slice(0, 4).map((draft) => <Link className="marketing-preview-card" href={draft.href} key={draft.id}>
            <span>{channelLabels[draft.channel] ?? draft.channel}</span><strong>{draft.title}</strong><p>{draft.short_body || draft.body}</p><small>{draftStatusLabels[draft.status] ?? draft.status}・内容を確認する →</small>
          </Link>)}
        </div> : null}
      </section>
      <section className="grid cols-3 visual-supporting-metrics">
        <article className="card">
          <p className="muted">投稿下書き</p>
          <div className="metric">{drafts.length.toLocaleString("ja-JP")}件</div>
          <p>{labels.stock}や月次レポートをもとに作成した{labels.draft}です。</p>
          <Link className="button" href={`/stores/${store.id}/growth-actions`}>確認して投稿へ</Link>
        </article>
        <article className="card">
          <p className="muted">AI改善提案</p>
          <div className="metric">{recommendations.length.toLocaleString("ja-JP")}件</div>
          <p>売上、在庫、{labels.customer}の状況から来月の打ち手を整理します。</p>
          <Link className="button" href={`/stores/${store.id}/marketing/recommendations`}>提案を見る</Link>
        </article>
        <article className="card">
          <p className="muted">次の操作</p>
          <div className="metric">確認して実行</div>
          <p>AIが勝手に公開せず、内容と出し先を確認してから実行します。</p>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions`}>実行待ちを見る</Link>
        </article>
      </section>
      <details className="card"><summary>機能一覧から選ぶ</summary><nav className="store-ai-context-links" aria-label="集客の機能一覧">
        <Link href={`/stores/${store.id}/growth-actions`}>今日の集客アクション・会話で作った下書き →</Link>
        <Link href={`/stores/${store.id}/marketing/drafts`}>従来の投稿下書き →</Link>
        <Link href={`/stores/${store.id}/growth-calendar`}>投稿・配信カレンダー →</Link>
        <Link href={`/stores/${store.id}/reviews`}>Google口コミ →</Link>
        <Link href={`/stores/${store.id}/results`}>集客・検索成果 →</Link>
        <Link href={`/stores/${store.id}/settings/channels`}>連携先を確認 →</Link>
      </nav></details>
    </AppShell>
  );
}
