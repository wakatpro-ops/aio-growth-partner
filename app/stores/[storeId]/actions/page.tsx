import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listRecommendedActions } from "@/lib/phase4/demand-actions";
import { getStore } from "@/lib/stores";
import { generateDemandActionPlanAction } from "../phase4c-actions";

function nextMonth() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function actionLabel(type: string) {
  const labels: Record<string, string> = {
    instagram: "Instagram投稿案",
    google_business_profile: "Google投稿案",
    store_pop: "店頭POP",
    customer_message: "既存顧客案内",
    inventory_order: "発注確認",
    service_focus: "重点サービス"
  };
  return labels[type] ?? type;
}

export default async function RecommendedActionsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeId } = await params;
  const { error } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "recommended_actions")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const actions = await listRecommendedActions(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="次アクション提案" description="需要予測と在庫アラートをもとに、投稿、Google投稿、店頭POP、顧客案内、発注確認の打ち手を整理します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice error">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <h3>提案を生成</h3>
        <form className="form-grid" action={generateDemandActionPlanAction.bind(null, store.id, `/stores/${store.id}/actions`)}>
          <label>対象月<input name="target_month" type="month" defaultValue={nextMonth()} required /></label>
          <div className="form-actions"><button className="button" type="submit">次アクションを生成</button></div>
        </form>
      </section>

      <section className="grid cols-2">
        {actions.map((action) => (
          <article className="card" key={action.id}>
            <p className="eyebrow">{actionLabel(action.action_type)} / {action.priority}</p>
            <h3>{action.title}</h3>
            <p>{action.body}</p>
            <p className="muted">対象: {action.item_name ?? "店舗全体"}</p>
            <p className="muted">理由: {action.reason}</p>
          </article>
        ))}
        {actions.length === 0 ? <article className="card"><h3>まだ提案がありません</h3><p>売上データと在庫データをもとに、次アクションを生成してください。</p></article> : null}
      </section>
    </AppShell>
  );
}
