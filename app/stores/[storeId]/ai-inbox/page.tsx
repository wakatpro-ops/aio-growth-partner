import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { emailCategoryLabel } from "@/lib/store-email/rules";
import { listStoreAiInboxes, listStoreEmailMessages } from "@/lib/store-email/inboxes";
import { getStore } from "@/lib/stores";
import type { StoreAiEmailMessage, StoreEmailCategory } from "@/types/store-ai-inbox";
import {
  applyReservationAction,
  archiveEmailMessageAction,
  archiveInboxAction,
  confirmEmailRecordAction,
  ignoreEmailMessageAction,
  restoreEmailMessageAction,
  restoreInboxAction,
  rotateInboxAction,
  setInboxStatusAction,
  updateInboxSettingsAction
} from "./actions";

const categories: StoreEmailCategory[] = ["reservation", "inquiry", "complaint", "review", "invoice_receipt", "purchasing", "inventory_shipping", "platform_notice", "advertising", "unknown", "sensitive"];
const categoryOptions = categories.filter((category) => category !== "sensitive" && category !== "reservation");
const dateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });

function localDateTimeValue(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function statusLabel(message: StoreAiEmailMessage) {
  if (message.processing_status === "applied") return "確認・反映済み";
  if (message.processing_status === "ignored") return "処理しない";
  if (message.processing_status === "rejected") return "安全のため除外";
  if (message.processing_status === "error") return "反映エラー・要確認";
  if (message.processing_status === "ready_to_apply") return "内容確認待ち";
  return "確認待ち";
}

function MessageCard({ storeId, message, deleted }: { storeId: string; message: StoreAiEmailMessage; deleted: boolean }) {
  const extracted = message.extracted_data ?? {};
  const pending = !["applied", "ignored", "rejected"].includes(message.processing_status);
  return <article className={`card ai-inbox-message category-${message.category}`} id={`message-${message.id}`}>
    <div className="ai-inbox-message-head">
      <div><span className="badge badge-strong">{emailCategoryLabel(message.category)}</span><span className="badge">{statusLabel(message)}</span></div>
      <time>{dateTime.format(new Date(message.received_at))}</time>
    </div>
    <h3>{message.subject}</h3>
    {!message.sensitive ? <p className="muted">{message.sender_name ? `${message.sender_name} ` : ""}{message.sender_email ?? message.sender_domain ?? "送信元不明"}</p> : null}
    <p>{message.summary}</p>
    <div className="ai-inbox-confidence" aria-label={`分類の確信度${Math.round(Number(message.classification_confidence) * 100)}パーセント`}>
      <span style={{ width: `${Math.round(Number(message.classification_confidence) * 100)}%` }} />
    </div>
    <small className="muted">分類の確信度 {Math.round(Number(message.classification_confidence) * 100)}% ・ {message.classification_reason}</small>

    {message.category === "reservation" && pending && !deleted ? <form className="form ai-inbox-review-form" action={applyReservationAction.bind(null, storeId, message.id)}>
      <div className="section-heading"><div><p className="eyebrow">予約台帳へ反映する前の確認</p><h4>足りない部分だけ直してください</h4></div></div>
      <div className="grid cols-2">
        <div className="field"><label>お客様名</label><input name="customer_name" required defaultValue={textValue(extracted.customer_name)} /></div>
        <div className="field"><label>予約内容</label><input name="service_name" defaultValue={textValue(extracted.service_name)} placeholder="例：アロマトリートメント60分" /></div>
        <div className="field"><label>開始日時</label><input name="starts_at" type="datetime-local" required defaultValue={localDateTimeValue(extracted.starts_at)} /></div>
        <div className="field"><label>終了日時</label><input name="ends_at" type="datetime-local" required defaultValue={localDateTimeValue(extracted.ends_at)} /></div>
        <div className="field"><label>電話番号</label><input name="customer_phone" defaultValue={textValue(extracted.customer_phone)} /></div>
        <div className="field"><label>メール</label><input name="customer_email" type="email" defaultValue={textValue(extracted.customer_email)} /></div>
      </div>
      <PendingSubmitButton pendingLabel="予約台帳へ反映しています...">内容を確認して予約へ反映</PendingSubmitButton>
    </form> : null}

    {message.category !== "reservation" && !message.sensitive && pending && !deleted ? <form className="form ai-inbox-review-form" action={confirmEmailRecordAction.bind(null, storeId, message.id)}>
      <div className="field"><label>分類を確認</label><select name="category" defaultValue={message.category}>{categoryOptions.map((category) => <option value={category} key={category}>{emailCategoryLabel(category)}</option>)}</select></div>
      <PendingSubmitButton pendingLabel="確認結果を保存しています...">分類を確認済みにする</PendingSubmitButton>
    </form> : null}

    {message.processing_status === "applied" && message.applied_target_type === "booking" && message.applied_target_id ? <Link className="button secondary" href={`/stores/${storeId}/bookings/${message.applied_target_id}`}>反映した予約を見る</Link> : null}
    <div className="button-row ai-inbox-secondary-actions">
      {!deleted && pending && !message.sensitive ? <form action={ignoreEmailMessageAction.bind(null, storeId, message.id)}><PendingSubmitButton className="button secondary" pendingLabel="変更しています...">このメールは処理しない</PendingSubmitButton></form> : null}
      {deleted
        ? <form action={restoreEmailMessageAction.bind(null, storeId, message.id)}><PendingSubmitButton className="button secondary" pendingLabel="元に戻しています...">元に戻す</PendingSubmitButton></form>
        : <form action={archiveEmailMessageAction.bind(null, storeId, message.id)}><ConfirmSubmitButton message="このメールを削除済みに移します。解析結果と操作履歴は保持され、あとから元に戻せます。">削除</ConfirmSubmitButton></form>}
    </div>
  </article>;
}

export default async function StoreAiInboxPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ view?: string; category?: string; saved?: string; status?: string; rotated?: string; deleted?: string; restored?: string; confirmed?: string; ignored?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const organizationRole = access?.organizationRoles[store.organization_id] ?? "";
  const storeRole = access?.storeRoles[store.id] ?? "";
  const manageable = Boolean(access?.isPlatformAdmin || ["org_owner", "store_manager"].includes(organizationRole) || storeRole === "store_manager");
  const deleted = query.view === "deleted";
  const category = categories.includes(query.category as StoreEmailCategory) ? query.category as StoreEmailCategory : null;
  const [inboxes, messages] = await Promise.all([listStoreAiInboxes(store.id), listStoreEmailMessages(store.id, { archived: deleted, category })]);
  const inbox = inboxes.find((item) => !item.archived_at) ?? null;
  const archivedInboxes = inboxes.filter((item) => item.archived_at);
  const counts = Object.fromEntries(categories.map((key) => [key, messages.filter((message) => message.category === key).length]));
  const awaiting = messages.filter((message) => !["applied", "ignored", "rejected"].includes(message.processing_status)).length;

  return <AppShell>
    <PageHeader eyebrow="店舗メールをまとめて整理" title="AI受信箱" description="普段の店舗メールを1か所へ転送すると、予約・問い合わせ・クレーム・請求・仕入をAIが分け、確認後に店舗データへ反映します。" />
    {query.saved ? <p className="notice success">AI受信箱の安全設定を保存しました。</p> : null}
    {query.status ? <p className="notice success">受信状態を変更しました。</p> : null}
    {query.rotated ? <p className="notice success">新しい受信アドレスを発行しました。転送先を新しいアドレスへ変更してください。</p> : null}
    {query.deleted ? <p className="notice success">削除済みに移しました。内容は保持され、元に戻せます。</p> : null}
    {query.restored ? <p className="notice success">元に戻しました。</p> : null}
    {query.confirmed ? <p className="notice success">分類を確認済みにしました。</p> : null}
    {query.ignored ? <p className="notice success">このメールを処理しない状態にしました。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

    {inbox ? <>
      <section className="card ai-inbox-address-card">
        <div><p className="eyebrow">この店舗だけの転送先</p><h2>{inbox.email_address}</h2><p>店舗で普段使っているメールから、このアドレスへ自動転送を設定してください。予約用に分ける必要はありません。</p></div>
        <div className="button-row"><CopyButton value={inbox.email_address} label="受信アドレスをコピー" /><span className={`badge ${inbox.status === "active" ? "badge-strong" : ""}`}>{inbox.status === "active" ? "受信中" : "一時停止中"}</span></div>
      </section>
      <section className="ai-inbox-steps">
        <article><strong>① 転送する</strong><span>今の店舗メールをそのまま転送</span></article>
        <article><strong>② AIが整理</strong><span>予約・問い合わせ・請求などへ分類</span></article>
        <article><strong>③ 確認して反映</strong><span>勝手に返信・決済・設定変更はしません</span></article>
      </section>
      <p className="notice warning">パスワード再設定、認証コード、カード情報、本人確認書類などは自動処理せず、本文も保存しません。元の受信箱で確認してください。添付ファイルも保存しません。</p>

      {manageable ? <details className="card ai-inbox-settings">
        <summary><strong>自動反映と受信アドレスの安全設定</strong><span>店舗オーナー・管理者向け</span></summary>
        <form className="form" action={updateInboxSettingsAction.bind(null, store.id)}>
          <label className="check-row"><input type="checkbox" name="auto_apply_reservations" defaultChecked={inbox.auto_apply_reservations} />確認済みの定型予約メールだけ予約台帳へ自動反映する</label>
          <div className="field"><label>信頼する予約通知の送信元</label><textarea name="trusted_senders" defaultValue={inbox.trusted_senders.join("\n")} placeholder="reserve@example.com&#10;booking@example.jp" /><small>完全一致した送信元だけが対象です。1行に1件入力します。未登録の場合は必ず人が確認します。</small></div>
          <PendingSubmitButton pendingLabel="安全設定を保存しています...">安全設定を保存</PendingSubmitButton>
        </form>
        <div className="button-row ai-inbox-admin-actions">
          <form action={setInboxStatusAction.bind(null, store.id, inbox.status === "active" ? "paused" : "active")}><PendingSubmitButton className="button secondary" pendingLabel="状態を変更しています...">{inbox.status === "active" ? "受信を一時停止" : "受信を再開"}</PendingSubmitButton></form>
          <form action={rotateInboxAction.bind(null, store.id)}><ConfirmSubmitButton message="受信アドレスを再発行します。以前のアドレスでは新しいメールを受け取れなくなります。受信履歴は保持されます。">受信アドレスを再発行</ConfirmSubmitButton></form>
          <form action={archiveInboxAction.bind(null, store.id)}><ConfirmSubmitButton message="AI受信箱を削除済みに移します。新しいメールの受信は止まりますが、受信履歴と操作履歴は保持され、あとから元に戻せます。">AI受信箱を削除</ConfirmSubmitButton></form>
        </div>
      </details> : null}
    </> : <section className="card"><h2>AI受信箱は現在削除済みです</h2><p>受信履歴は保持されています。店舗オーナー・管理者は、削除済みの受信箱を元に戻せます。</p>{manageable && archivedInboxes[0] ? <form action={restoreInboxAction.bind(null, store.id, archivedInboxes[0].id)}><PendingSubmitButton pendingLabel="元に戻しています...">AI受信箱を元に戻す</PendingSubmitButton></form> : null}</section>}

    <section className="grid cols-3 ai-inbox-metrics">
      <article className="card"><p className="muted">表示中</p><div className="metric">{messages.length}件</div></article>
      <article className="card"><p className="muted">確認待ち</p><div className="metric">{awaiting}件</div></article>
      <article className="card"><p className="muted">最終受信</p><div className="metric metric-small">{inbox?.last_received_at ? dateTime.format(new Date(inbox.last_received_at)) : "まだありません"}</div></article>
    </section>
    <section className="card ai-inbox-ledger">
      <div className="section-heading"><div><p className="eyebrow">受信結果</p><h2>{deleted ? "削除済みメール" : "AIが整理したメール"}</h2></div><Link href={`/stores/${store.id}/ai-inbox?view=${deleted ? "active" : "deleted"}`} className="button secondary">{deleted ? "受信中へ戻る" : "削除済みを見る"}</Link></div>
      <nav className="ai-inbox-category-tabs" aria-label="メール分類">
        <Link className={!category ? "active" : ""} href={`/stores/${store.id}/ai-inbox${deleted ? "?view=deleted" : ""}`}>すべて {messages.length}</Link>
        {categories.map((key) => <Link className={category === key ? "active" : ""} href={`/stores/${store.id}/ai-inbox?${new URLSearchParams({ ...(deleted ? { view: "deleted" } : {}), category: key }).toString()}`} key={key}>{emailCategoryLabel(key)} {counts[key] ?? 0}</Link>)}
      </nav>
      {messages.length ? <div className="ai-inbox-message-list">{messages.map((message) => <MessageCard storeId={store.id} message={message} deleted={deleted} key={message.id} />)}</div> : <div className="booking-empty"><strong>{deleted ? "削除済みメールはありません" : "まだメールを受信していません"}</strong><p>{deleted ? "削除した受信結果はここから元に戻せます。" : "転送設定後に届いたメールを、AIがここへ整理します。"}</p></div>}
    </section>
  </AppShell>;
}
