import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGrowthAction, growthActionChannelLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { updateGrowthActionDraftAction } from "../../actions";

export default async function GrowthActionEditPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; actionId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeId, actionId } = await params;
  const { error } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "draft_editing")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action || !action.drafts?.[0]) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const draft = action.drafts[0];
  const memo = typeof draft.metadata?.memo === "string" ? draft.metadata.memo : "";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="下書き編集" description={`${growthActionChannelLabel(draft.channel)}の文章を整えます。`} />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <form className="card form" action={updateGrowthActionDraftAction.bind(null, store.id, action.id)}>
        <input type="hidden" name="draft_id" value={draft.id} />
        <div className="grid cols-2">
          <label className="field">タイトル
            <input name="title" defaultValue={draft.title} required />
          </label>
          <label className="field">CTA
            <input name="call_to_action" defaultValue={draft.call_to_action ?? ""} placeholder="予約・相談はこちら" />
          </label>
        </div>
        <label className="field">本文
          <textarea name="body" rows={12} defaultValue={draft.body} required />
        </label>
        <label className="field">短縮版
          <textarea name="short_body" rows={4} defaultValue={draft.short_body ?? ""} />
        </label>
        <label className="field">ハッシュタグ
          <input name="hashtags" defaultValue={draft.hashtags.join(" ")} placeholder="#車検 #点検 #地域名" />
        </label>
        <label className="field">編集メモ
          <textarea name="memo" rows={3} defaultValue={memo} placeholder="修正意図や確認事項を残せます" />
        </label>
        <div className="form-actions">
          <button className="button" type="submit">保存</button>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
