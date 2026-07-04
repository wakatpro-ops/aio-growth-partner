import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listMarketingDrafts } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";

const channelLabels = {
  instagram: "Instagram",
  google_business_profile: "Googleビジネスプロフィール",
  other: "その他"
};

const statusLabels = {
  draft: "下書き",
  approved: "承認済み",
  published: "公開済み",
  archived: "保管"
};

export default async function MarketingDraftsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "marketing_drafts")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const drafts = await listMarketingDrafts(store.id);
  const draftLabel = store.industry_type_key === "auto_repair" ? "整備投稿下書き" : "投稿下書き";

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={draftLabel}
        description="AI生成した投稿案と手動作成した投稿案を店舗ごとに管理します。"
        action={<Link className="button" href={`/stores/${store.id}/marketing/drafts/new`}>新規作成</Link>}
      />
      <StoreBusinessNav store={store} />
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>投稿先</th>
              <th>状態</th>
              <th>作成日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr key={draft.id}>
                <td>{draft.title}<br /><span className="muted">{draft.call_to_action ?? "行動導線なし"}</span></td>
                <td>{channelLabels[draft.channel]}</td>
                <td><span className="badge">{statusLabels[draft.status]}</span></td>
                <td>{new Date(draft.created_at).toLocaleDateString("ja-JP")}</td>
                <td><Link className="button secondary" href={`/stores/${store.id}/marketing/drafts/${draft.id}`}>詳細</Link></td>
              </tr>
            ))}
            {drafts.length === 0 ? <tr><td colSpan={5}>まだ投稿下書きがありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
