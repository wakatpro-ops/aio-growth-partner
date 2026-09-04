import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { DonutChart } from "@/components/ui/data-visuals";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listAiRecommendations, listMarketingDrafts } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";

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
  if (!isFeatureEnabled(flags, "marketing_drafts")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const labels = marketingLabels(store.industry_type_key);
  const [drafts, recommendations] = await Promise.all([
    listMarketingDrafts(store.id),
    listAiRecommendations(store.id)
  ]);
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
        description={`${labels.focus}を軸に、AI提案、投稿下書き、口コミ対応、配信予定を一つの入口から確認します。`}
      />
      <StoreBusinessNav store={store} />
      <section className="visual-section">
        <div className="section-heading"><div><p className="eyebrow">投稿の準備状況</p><h2>何を確認すべきか、ひと目で把握</h2></div><p>AIが勝手に公開せず、投稿済みになるまで人が確認します。</p></div>
        <div className="visual-grid cols-2">
          <DonutChart title="投稿の状態" centerLabel="下書き合計" centerValue={`${drafts.length}件`} data={statusCounts.map(([label, value]) => ({ label, value, displayValue: `${value}件` }))} emptyMessage="投稿下書きを作成すると、確認状況を表示できます。" />
          <DonutChart title="投稿先" centerLabel="媒体数" centerValue={`${channelCounts.length}種類`} data={channelCounts.map(([label, value]) => ({ label, value, displayValue: `${value}件` }))} emptyMessage="投稿下書きを作成すると、媒体ごとの内訳を表示できます。" />
        </div>
        {drafts.length ? <div className="marketing-preview-grid">
          {drafts.slice(0, 4).map((draft) => <Link className="marketing-preview-card" href={`/stores/${store.id}/marketing/drafts`} key={draft.id}>
            <span>{channelLabels[draft.channel] ?? draft.channel}</span><strong>{draft.title}</strong><p>{draft.short_body || draft.body}</p><small>{draftStatusLabels[draft.status] ?? draft.status}・内容を確認する →</small>
          </Link>)}
        </div> : null}
      </section>
      <section className="grid cols-3 visual-supporting-metrics">
        <article className="card">
          <p className="muted">投稿下書き</p>
          <div className="metric">{drafts.length.toLocaleString("ja-JP")}件</div>
          <p>{labels.stock}や月次レポートをもとに作成した{labels.draft}です。</p>
          <Link className="button" href={`/stores/${store.id}/marketing/drafts`}>確認して投稿へ</Link>
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
      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">集客業務</p><h2>目的から選ぶ</h2></div></div>
        <div className="hub-grid">
          <Link className="hub-link primary" href={`/stores/${store.id}/growth-actions`}><h3>今日の集客アクション</h3><p>提案の根拠と内容を確認し、実行するものを選びます。</p><strong>確認待ちを開く →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/marketing/drafts`}><h3>投稿下書き</h3><p>Google・Instagramなどの下書きを編集し、公開前に確認します。</p><strong>下書きを開く →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/growth-calendar`}><h3>投稿・配信カレンダー</h3><p>準備した投稿や顧客向け案内の予定を時系列で確認します。</p><strong>カレンダーを開く →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/reviews`}><h3>Google口コミ</h3><p>取得済みの口コミを確認し、返信案を準備します。</p><strong>口コミ対応へ →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/results`}><h3>集客・検索成果</h3><p>検索での見つかり方や施策前後の変化を確認します。</p><strong>成果を確認 →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/settings/channels`}><h3>連携先を確認</h3><p>Google・SNSなど、利用可能なチャネルと接続状況を確認します。</p><strong>チャネル設定へ →</strong></Link>
        </div>
      </section>
    </AppShell>
  );
}
