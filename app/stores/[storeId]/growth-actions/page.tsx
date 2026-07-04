import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { growthActionChannelLabel, growthActionStatusLabel, listGrowthActions } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { generateGrowthActionsAction } from "./actions";
import type { GrowthActionStatus } from "@/types/phase5";

function priorityLabel(priority: string) {
  if (priority === "high") return "高";
  if (priority === "low") return "低";
  return "中";
}

export default async function GrowthActionsPage({
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
  if (!isFeatureEnabled(flags, "growth_action_center")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const actions = await listGrowthActions(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="集客アクションセンター"
        description="AI提案を、Google投稿、Instagram、クチコミ返信、既存顧客案内、店頭POP、LINE配信用の下書きに変換します。"
      />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice error">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <h3>下書きを生成</h3>
        <p>売上データ、AI月次売上レポート、需要予測、次アクション提案、店舗プロフィールをもとに作成します。</p>
        <div className="button-row">
          <form action={generateGrowthActionsAction.bind(null, store.id)}>
            <button className="button" type="submit">集客アクションを生成</button>
          </form>
          <Link className="button secondary" href={`/stores/${store.id}/growth-calendar`}>カレンダーを見る</Link>
        </div>
      </section>

      <section className="card">
        <h3>実行待ちアクション</h3>
        <table className="table">
          <thead>
            <tr><th>チャネル</th><th>タイトル</th><th>優先度</th><th>推奨日</th><th>ステータス</th><th>理由</th><th></th></tr>
          </thead>
          <tbody>
            {actions.map((action) => (
              <tr key={action.id}>
                <td>{growthActionChannelLabel(action.target_channel)}</td>
                <td>{action.title}</td>
                <td>{priorityLabel(action.priority)}</td>
                <td>{action.recommended_date ?? "-"}</td>
                <td>{growthActionStatusLabel(action.status as GrowthActionStatus)}</td>
                <td>{action.reason}</td>
                <td>
                  <div className="button-row">
                    <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>詳細</Link>
                    <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/edit`}>編集</Link>
                    <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/preview`}>プレビュー</Link>
                  </div>
                </td>
              </tr>
            ))}
            {actions.length === 0 ? <tr><td colSpan={7}>まだ集客アクションがありません。生成ボタンから下書きを作成してください。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
