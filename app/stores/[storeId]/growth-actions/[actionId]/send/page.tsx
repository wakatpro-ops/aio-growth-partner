import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { googlePublishTargets } from "@/lib/phase5/google-adapters";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getGrowthAction, growthActionChannelLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { prepareGooglePublishJobAction } from "../../actions";

function draftText(action: NonNullable<Awaited<ReturnType<typeof getGrowthAction>>>) {
  const draft = action.drafts?.[0];
  if (!draft) return action.summary;
  return [draft.body, draft.hashtags.join(" "), draft.call_to_action].filter(Boolean).join("\n\n");
}

export default async function GrowthActionSendPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; actionId: string }>;
  searchParams: Promise<{ error?: string; prepared?: string }>;
}) {
  const { storeId, actionId } = await params;
  const { error, prepared } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "external_publish_jobs")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const defaultTarget = action.target_channel === "google_business_profile" ? "google_business_profile" : action.target_channel === "customer_message" ? "gmail" : "google_calendar";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleへ送る前の確認" description="送信先、本文、予約日時を確認し、Phase 5-Cでは送信準備ログとして保存します。" />
      <StoreBusinessNav store={store} />
      {prepared ? <p className="notice success">送信準備を保存しました。外部サービスへの実送信はまだ行っていません。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <div className="grid cols-2">
          <label className="field">Google接続状態
            <input value={googleConnectionStatusLabel(state.connection?.status)} readOnly />
          </label>
          <label className="field">元チャネル
            <input value={growthActionChannelLabel(action.target_channel)} readOnly />
          </label>
        </div>
        <p className="notice">今回はGoogle APIへの実投稿・メール送信・予定作成は行わず、送信前確認とログ保存まで行います。</p>
      </section>

      <form className="card form" action={prepareGooglePublishJobAction.bind(null, store.id, action.id)}>
        <div className="grid cols-2">
          <label className="field">送信先
            <select name="target" defaultValue={defaultTarget}>
              {googlePublishTargets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}
            </select>
          </label>
          <label className="field">対象ID
            <input name="target_id" placeholder="ロケーションID、メールアドレス、カレンダーIDなど" />
          </label>
          <label className="field">予約日時
            <input name="scheduled_at" type="datetime-local" defaultValue={action.scheduled_at ? action.scheduled_at.slice(0, 16) : ""} />
          </label>
          <label className="field">ステータス
            <input value="送信準備として保存" readOnly />
          </label>
        </div>
        <label className="field">タイトル
          <input value={action.drafts?.[0]?.title ?? action.title} readOnly />
        </label>
        <label className="field">本文
          <textarea rows={12} value={draftText(action)} readOnly />
        </label>
        <label className="field">確認メモ
          <textarea name="note" rows={3} placeholder="送信前に確認したこと、担当者へのメモなど" />
        </label>
        <div className="form-actions">
          <button className="button" type="submit">送信準備を保存</button>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>詳細へ戻る</Link>
        </div>
      </form>

      <section className="grid cols-3">
        {googlePublishTargets.map((target) => (
          <article className="card" key={target.key}>
            <h3>{target.label}</h3>
            <p>{target.note}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
