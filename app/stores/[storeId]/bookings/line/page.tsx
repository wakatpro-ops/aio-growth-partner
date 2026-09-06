import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LineStoreLinkCode } from "@/components/bookings/line-store-link-code";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { canEditStore } from "@/lib/auth/server";
import { getLineBookingIntegration, getLineBookingStats } from "@/lib/line/settings";
import { getStore } from "@/lib/stores";
import { archiveLineBookingAction, createLineStoreLinkCodeAction, enableLineBookingAction, updateLineBookingOptionsAction } from "./actions";

export default async function LineBookingSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string; deleted?: string; error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) notFound();
  const integration = await getLineBookingIntegration(store.id, true);
  const active = integration && !integration.archived_at;
  const stats = active ? await getLineBookingStats(store.id) : { contacts: 0, pendingBookings: 0, scheduledReminders: 0, recentLogs: [] };
  const credentialsReady = Boolean(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);

  return <AppShell>
    <PageHeader eyebrow="顧客・予約" title="LINE予約窓口" description="お客様へ一問ずつ希望を伺い、予約台帳へ店舗確認待ちの予約として安全に取り込みます。" action={<Link className="button secondary" href={`/stores/${store.id}/bookings`}>予約へ戻る</Link>} />
    {query.saved ? <p className="notice success">LINE予約設定を保存しました。</p> : null}
    {query.deleted ? <p className="notice success">LINE予約窓口を削除済みに移しました。予約データと同意履歴は保持されています。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
    {!credentialsReady ? <p className="notice warning">LINE Messaging APIの本番認証情報とWebhookはまだ設定中です。設定完了までは、お客様へ連携コードを案内しないでください。</p> : null}

    {!active ? <section className="card line-booking-intro">
      <div><p className="eyebrow">段階2</p><h2>LINEを予約の入口にする</h2><p>現在の予約台帳を使い、予約希望・確認・日時変更・キャンセル・前日リマインドをLINEから受け付けます。初期設定では店舗が確認するまで予約は確定しません。</p></div>
      <form action={enableLineBookingAction.bind(null, store.id)}><PendingSubmitButton disabled={!credentialsReady} pendingLabel="LINE予約を準備しています...">{integration?.archived_at ? "LINE予約窓口を元に戻す" : "LINE予約窓口を有効にする"}</PendingSubmitButton></form>
    </section> : <>
      <section className="grid cols-3 booking-metrics">
        <article className="card"><span>関連付け済み</span><strong>{stats.contacts}人</strong><small>店舗コードと同意を確認済み</small></article>
        <article className="card"><span>店舗確認待ち</span><strong>{stats.pendingBookings}件</strong><small>予約台帳から確認できます</small></article>
        <article className="card"><span>前日お知らせ予定</span><strong>{stats.scheduledReminders}件</strong><small>配信停止中のお客様には送りません</small></article>
      </section>

      <section className="booking-settings-grid">
        <article className="card">
          <div className="section-heading"><div><p className="eyebrow">お客様を安全に店舗へ接続</p><h2>店舗連携コード</h2></div><span className="badge">1回・15分</span></div>
          <p>お客様本人へ発行したコードだけで店舗を関連付けます。他店の予約や同意情報とは混ざりません。</p>
          <LineStoreLinkCode action={createLineStoreLinkCodeAction.bind(null, store.id)} />
        </article>

        <article className="card">
          <div className="section-heading"><div><p className="eyebrow">受付方法</p><h2>LINE予約の設定</h2></div><span className={`badge ${integration.status === "active" ? "badge-strong" : ""}`}>{integration.status === "active" ? "受付中" : "停止中"}</span></div>
          <form className="form" action={updateLineBookingOptionsAction.bind(null, store.id)}>
            <label className="check-row"><input name="booking_enabled" type="checkbox" defaultChecked={integration.booking_enabled} />LINEで予約を受け付ける</label>
            <label className="check-row"><input name="auto_confirm_bookings" type="checkbox" defaultChecked={integration.auto_confirm_bookings} />空き確認後に自動で予約を確定する</label>
            <p className="field-help">自動確定をオフにすると「店舗確認待ち」で登録されます。担当・設備が未指定の予約は重複判定ができないため、オンでも店舗確認待ちになります。運用開始時はオフを推奨します。</p>
            <div className="field"><label htmlFor="retention_days">LINE連携情報の保持日数</label><input id="retention_days" name="retention_days" type="number" min="30" max="3650" defaultValue={integration.retention_days} /></div>
            <PendingSubmitButton pendingLabel="設定を保存しています...">設定を保存</PendingSubmitButton>
          </form>
        </article>
      </section>

      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">案内内容</p><h2>お客様にできること</h2></div></div>
        <div className="line-capability-grid">
          {["予約内容を選ぶ", "担当者・設備の希望", "空き時間候補から選ぶ", "予約状況を確認", "日時変更・キャンセル", "前日リマインド", "いつでも配信停止"].map((label) => <span key={label}>{label}</span>)}
        </div>
      </section>

      {stats.recentLogs.length ? <section className="card"><div className="section-heading"><div><p className="eyebrow">監査</p><h2>最近のLINE処理</h2></div></div><div className="booking-config-list">{stats.recentLogs.map((log: { id: string; action_type: string; status: string; message: string | null; created_at: string }) => <div className="booking-config-row" key={log.id}><div><strong>{log.message || log.action_type}</strong><small>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(log.created_at))}</small></div><span className="badge">{log.status}</span></div>)}</div></section> : null}

      <section className="card danger-zone"><h2>LINE予約窓口を削除</h2><p>新規受付と未送信リマインドを停止します。予約・同意・監査履歴は消去せず、再開時に元へ戻せます。</p><form action={archiveLineBookingAction.bind(null, store.id)}><ConfirmSubmitButton message="LINE予約窓口を削除済みに移します。既存予約は保持されます。">LINE予約窓口を削除</ConfirmSubmitButton></form></section>
    </>}
  </AppShell>;
}
