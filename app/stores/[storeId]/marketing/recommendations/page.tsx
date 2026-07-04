import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listAiRecommendations } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";
import { generateMonthlyRecommendationAction } from "../actions";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default async function RecommendationsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "ai_monthly_recommendations")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const recommendations = await listAiRecommendations(store.id);
  const error = typeof query.error === "string" ? query.error : null;
  const labels = store.industry_type_key === "auto_repair"
    ? { title: "整備集客のAI改善提案", subject: "整備見積・整備請求・部品在庫" }
    : { title: "AI改善提案", subject: "見積・請求・商品在庫" };

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={labels.title} description={`${labels.subject}をもとに来月の集客テーマを作ります。`} />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}
      <form className="card form" action={generateMonthlyRecommendationAction.bind(null, store.id)}>
        <div className="field">
          <label htmlFor="month">対象月</label>
          <input id="month" name="month" type="month" defaultValue={thisMonth()} />
        </div>
        <button className="button" type="submit">AI改善提案を作成</button>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>対象月</th>
              <th>状態</th>
              <th>作成日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((recommendation) => (
              <tr key={recommendation.id}>
                <td>{recommendation.title}</td>
                <td>{recommendation.month}</td>
                <td><span className="badge">{recommendation.status === "active" ? "有効" : "保管"}</span></td>
                <td>{new Date(recommendation.created_at).toLocaleDateString("ja-JP")}</td>
                <td><Link className="button secondary" href={`/stores/${store.id}/marketing/recommendations/${recommendation.id}`}>詳細</Link></td>
              </tr>
            ))}
            {recommendations.length === 0 ? <tr><td colSpan={5}>まだAI改善提案がありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
