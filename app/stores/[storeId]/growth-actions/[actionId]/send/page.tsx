import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { googlePublishTargets } from "@/lib/phase5/google-adapters";
import { getGoogleIntegrationState, googleConnectionStatusLabel, googleJobExternalId, googleJobExternalLink, googleJobSummary } from "@/lib/phase5/google-integrations";
import { getGrowthAction, growthActionChannelLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { executeGoogleIntegrationAction, prepareGooglePublishJobAction } from "../../actions";

function draftText(action: NonNullable<Awaited<ReturnType<typeof getGrowthAction>>>) {
  const draft = action.drafts?.[0];
  if (!draft) return action.summary;
  return [draft.body, draft.hashtags.join(" "), draft.call_to_action].filter(Boolean).join("\n\n");
}

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function jobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ready: "準備済み",
    processing: "処理中",
    success: "成功",
    error: "失敗"
  };
  return labels[status] ?? status;
}

function jobChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    gmail: "Gmail下書き",
    google_calendar: "Googleカレンダー",
    google_business_profile: "Googleビジネスプロフィール"
  };
  return labels[channel] ?? channel;
}

export default async function GrowthActionSendPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; actionId: string }>;
  searchParams: Promise<{ error?: string; prepared?: string; executed?: string; job?: string }>;
}) {
  const { storeId, actionId } = await params;
  const { error, prepared, executed, job } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "external_publish_jobs")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const defaultTarget = action.target_channel === "google_business_profile" ? "google_business_profile" : action.target_channel === "customer_message" ? "gmail" : "google_calendar";
  const actionJobs = state.jobs.filter((item) => item.growth_action_id === action.id);
  const selectedJob = actionJobs.find((item) => item.id === job) ?? actionJobs.find((item) => item.status === "success") ?? null;
  const selectedSummary = selectedJob ? googleJobSummary(selectedJob) : null;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Google連携実行" description="送信前確認を残しつつ、Gmail下書き作成とGoogleカレンダー予定作成を実行できます。" />
      <StoreBusinessNav store={store} />
      {prepared ? <p className="notice success">送信準備を保存しました。外部サービスへの実送信はまだ行っていません。</p> : null}
      {executed ? <p className="notice success">{executed === "gmail" ? "Gmail下書きを作成しました。" : "Googleカレンダー予定を作成しました。"}</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      {selectedJob && selectedSummary ? (
        <section className="card">
          <h2>作成結果</h2>
          <div className="grid cols-2">
            <label className="field">作成先
              <input value={jobChannelLabel(selectedJob.channel)} readOnly />
            </label>
            <label className="field">状態
              <input value={jobStatusLabel(selectedJob.status)} readOnly />
            </label>
            <label className="field">タイトル
              <input value={selectedSummary.title} readOnly />
            </label>
            <label className="field">宛先 / カレンダー
              <input value={selectedSummary.target ?? "-"} readOnly />
            </label>
            <label className="field">予定日時
              <input value={dateTime(selectedSummary.scheduledAt)} readOnly />
            </label>
            <label className="field">外部ID
              <input value={selectedSummary.externalId ?? "-"} readOnly />
            </label>
          </div>
          <div className="form-actions">
            {selectedSummary.externalLink ? <Link className="button secondary" href={selectedSummary.externalLink} target="_blank">Google側で確認</Link> : null}
            <Link className="button secondary" href={`/stores/${store.id}/settings/google`}>連携ログを見る</Link>
          </div>
        </section>
      ) : null}

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
          <PendingSubmitButton pendingLabel="送信前の確認内容を保存しています...">送信準備を保存</PendingSubmitButton>
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
          <label className="field checkbox-row">
            <input name="force_duplicate" type="checkbox" value="1" />
            同じ内容でも再作成する
          </label>
          <p className="muted">成功済みの同じ下書きがある場合は、誤作成を防ぐため通常は停止します。</p>
          <PendingSubmitButton pendingLabel="Gmailへ安全に接続しています...">Gmail下書きを作成</PendingSubmitButton>
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
          <label className="field checkbox-row">
            <input name="force_duplicate" type="checkbox" value="1" />
            同じ内容でも再作成する
          </label>
          <p className="muted">成功済みの同じ予定がある場合は、誤作成を防ぐため通常は停止します。</p>
          <PendingSubmitButton pendingLabel="カレンダーへ安全に接続しています...">カレンダー予定を作成</PendingSubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>このアクションのGoogle連携履歴</h2>
        {actionJobs.length ? (
          <table className="table compact">
            <thead>
              <tr>
                <th>日時</th>
                <th>種類</th>
                <th>状態</th>
                <th>外部ID</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {actionJobs.map((item) => {
                const summary = googleJobSummary(item);
                const link = googleJobExternalLink(item);
                return (
                  <tr key={item.id}>
                    <td>{dateTime(item.created_at)}</td>
                    <td>{jobChannelLabel(item.channel)}</td>
                    <td><span className="badge">{jobStatusLabel(item.status)}</span></td>
                    <td>{googleJobExternalId(item) ?? "-"}</td>
                    <td>
                      {summary.title}<br />
                      <span className="muted">{item.error_message ?? summary.target ?? "-"}</span>
                      {link ? <><br /><Link href={link} target="_blank">Google側で開く</Link></> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="muted">このアクションのGoogle連携履歴はまだありません。</p>}
      </section>
    </AppShell>
  );
}
