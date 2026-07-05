import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGrowthAction, growthActionChannelLabel, growthActionStatusLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { submitGrowthActionApprovalAction, updateGrowthActionStatusAction } from "../actions";
import type { GrowthActionStatus } from "@/types/phase5";

const statuses: GrowthActionStatus[] = ["todo", "drafted", "pending_approval", "approved", "rejected", "done", "paused"];

function draftText(title: string, body: string, hashtags: string[], callToAction: string | null) {
  return [
    title,
    "",
    body,
    hashtags.length > 0 ? `\n${hashtags.join(" ")}` : "",
    callToAction ? `\n${callToAction}` : ""
  ].join("\n").trim();
}

export default async function GrowthActionDetailPage({
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
  if (!isFeatureEnabled(flags, "growth_action_center")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action) notFound();
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={action.title} description={action.summary} />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice error">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <div className="form-grid">
          <label>対象チャネル<input value={growthActionChannelLabel(action.target_channel)} readOnly /></label>
          <label>推奨実行日<input value={action.recommended_date ?? "-"} readOnly /></label>
          <label>優先度<input value={action.priority} readOnly /></label>
          <label>外部連携状態<input value={action.external_status ?? "not_connected"} readOnly /></label>
        </div>
        <p className="muted">理由: {action.reason}</p>
        <form className="form-grid" action={updateGrowthActionStatusAction.bind(null, store.id, action.id)}>
          <label>ステータス
            <select name="status" defaultValue={action.status}>
              {statuses.map((status) => <option key={status} value={status}>{growthActionStatusLabel(status)}</option>)}
            </select>
          </label>
          <div className="form-actions"><button className="button" type="submit">ステータスを更新</button></div>
        </form>
        <form className="form-grid" action={submitGrowthActionApprovalAction.bind(null, store.id, action.id)}>
          <label>承認フロー
            <select name="approval_status" defaultValue={action.status === "approved" ? "approved" : action.status === "rejected" ? "rejected" : "pending"}>
              <option value="pending">承認待ち</option>
              <option value="approved">承認済み</option>
              <option value="rejected">差し戻し</option>
            </select>
          </label>
          <label>承認コメント / 差し戻し理由
            <textarea name="comment" rows={3} placeholder="確認メモを残せます" />
          </label>
          <div className="form-actions"><button className="button secondary" type="submit">承認状態を保存</button></div>
        </form>
      </section>

      <section className="grid cols-2">
        {(action.drafts ?? []).map((draft) => (
          <article className="card" key={draft.id}>
            <p className="eyebrow">{growthActionChannelLabel(draft.channel)} / {draft.copy_variant}</p>
            <h3>{draft.title}</h3>
            <textarea
              readOnly
              rows={12}
              value={draftText(draft.title, draft.body, draft.hashtags, draft.call_to_action)}
              style={{ width: "100%", resize: "vertical" }}
            />
            {draft.short_body ? <p className="muted">短縮版: {draft.short_body}</p> : null}
          </article>
        ))}
      </section>

      <div className="form-actions">
        <Link className="button" href={`/stores/${store.id}/growth-actions/${action.id}/edit`}>下書きを編集</Link>
        <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/preview`}>プレビュー</Link>
        {action.target_channel === "google_business_profile" ? <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/manual-post`}>Google手動投稿補助</Link> : null}
        <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/send`}>Google送信前確認</Link>
        <Link className="button secondary" href={`/stores/${store.id}/growth-actions`}>一覧へ戻る</Link>
      </div>
    </AppShell>
  );
}
