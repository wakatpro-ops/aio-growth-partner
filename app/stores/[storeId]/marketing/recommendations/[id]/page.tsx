import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getAiRecommendation } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";
import { createDraftFromRecommendationAction } from "../../actions";

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="card">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="muted">該当する提案はまだありません。</p>
      )}
    </article>
  );
}

export default async function RecommendationDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { storeId, id } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "ai_monthly_recommendations")) notFound();

  const recommendation = await getAiRecommendation(store.id, id);
  if (!recommendation) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${industry.name} / ${recommendation.month}`}
        title={recommendation.title}
        description="AIが月次データから作成した改善提案です。投稿下書きへ展開できます。"
        action={
          <form action={createDraftFromRecommendationAction.bind(null, store.id, recommendation.id)}>
            <button className="button" type="submit">投稿下書きを作成</button>
          </form>
        }
      />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}
      <section className="grid cols-2">
        <ListSection title="今月の良かった点" items={recommendation.good_points} />
        <ListSection title="注意点" items={recommendation.cautions} />
        <ListSection title="来月やるべきこと" items={recommendation.next_actions} />
        <ListSection title="投稿すべきテーマ" items={recommendation.posting_themes} />
        <ListSection title="在庫・商品・サービスの改善提案" items={recommendation.inventory_suggestions} />
        <ListSection title="顧客対応の優先提案" items={recommendation.customer_priorities} />
      </section>
      {recommendation.ai_reasoning ? (
        <section className="card">
          <h3>AI判断理由</h3>
          <p>{recommendation.ai_reasoning}</p>
        </section>
      ) : null}
    </AppShell>
  );
}
