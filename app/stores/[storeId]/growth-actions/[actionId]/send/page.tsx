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
import { executeGoogleIntegrationAction, prepareGooglePublishJobAction } from "../../actions";

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
  searchParams: Promise<{ error?: string; prepared?: string; executed?: string }>;
}) {
  const { storeId, actionId } = await params;
  const { error, prepared, executed } = await searchParams;
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
      <PageHeader eyebrow={industry.name} title="Google連携実行" description="送信前確認を残しつつ、Gmail下書き作成とGoogleカレンダー予定作成を実行できます。" />
      <StoreBusinessNav store={store} />
      {prepared ? <p className="notice success">送信準備を保存しました。外部サービスへの実送信はまだ行っていません。</p> : null}
      {executed ? <p className="notice success">{executed === "gmail" ? "Gmail下書きを作成しました。" : "Googleカレンダー予定を作成しました。"}</p> : null}
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
        <p className="notice">Gmailは下書き作成のみで、メール送信はしません。Googleビジネスプロフィール投稿はまだ実行しません。</p>
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

      <section className="grid cols-2">
        <form className="card form" action={executeGoogleIntegrationAction.bind(null, store.id, action.id, "gmail")}>
          <h2>Gmail下書き作成</h2>
          <p className="muted">接続済みGoogleアカウントのGmailに、実際の下書きを作成します。メール送信はしません。</p>
          <label className="field">宛先メールアドレス
            <input name="recipient_email" type="email" placeholder="customer@example.com" required />
          </label>
          <label className="field">件名
            <input name="subject" defaultValue={action.drafts?.[0]?.title ?? action.title} />
          </label>
          <button className="button" type="submit">Gmail下書きを作成</button>
        </form>

        <form className="card form" action={executeGoogleIntegrationAction.bind(null, store.id, action.id, "google_calendar")}>
          <h2>Googleカレンダー予定作成</h2>
          <p className="muted">接続済みGoogleアカウントのカレンダーに、実際の予定を作成します。</p>
          <label className="field">カレンダーID
            <input name="calendar_id" defaultValue={state.calendar?.calendar_id ?? "primary"} />
          </label>
          <label className="field">予定タイトル
            <input name="event_title" defaultValue={action.drafts?.[0]?.title ?? action.title} />
          </label>
          <label className="field">予定日時
            <input name="scheduled_at" type="datetime-local" defaultValue={action.scheduled_at ? action.scheduled_at.slice(0, 16) : ""} />
          </label>
          <button className="button" type="submit">カレンダー予定を作成</button>
        </form>
      </section>
    </AppShell>
  );
}
