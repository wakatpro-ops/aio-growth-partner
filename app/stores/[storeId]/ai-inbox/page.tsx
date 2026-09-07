import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { emailCategoryLabel } from "@/lib/store-email/rules";
import { listStoreAiInboxes, listStoreEmailMessages, listStoreEmailTemplates } from "@/lib/store-email/inboxes";
import { getStore } from "@/lib/stores";
import type { BookingEmailEventType, StoreAiEmailMessage, StoreAiEmailTemplate, StoreEmailCategory } from "@/types/store-ai-inbox";
import {
  applyReservationAction,
  archiveEmailMessageAction,
  archiveEmailTemplateAction,
  archiveInboxAction,
  confirmEmailRecordAction,
  ignoreEmailMessageAction,
  restoreEmailMessageAction,
  restoreEmailTemplateAction,
  restoreInboxAction,
  rotateInboxAction,
  setInboxStatusAction,
  setEmailTemplateStatusAction,
  updateInboxSettingsAction
} from "./actions";

const categories: StoreEmailCategory[] = ["reservation", "inquiry", "complaint", "review", "invoice_receipt", "purchasing", "inventory_shipping", "platform_notice", "advertising", "unknown", "sensitive"];
const categoryOptions = categories.filter((category) => category !== "sensitive" && category !== "reservation");
const dateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });

const bookingEventLabels: Record<BookingEmailEventType, string> = {
  created: "新規予約",
  changed: "予約変更",
  cancelled: "予約キャンセル"
};

const providerLabels: Record<string, string> = {
  hotpepper_beauty: "ホットペッパービューティー",
  stores_reservation: "STORES 予約",
  reserva: "RESERVA",
  epark: "EPARK",
  rakuten_beauty: "楽天ビューティ",
  ozmall: "OZmall",
  minimo: "minimo"
};

function providerLabel(value: string | null) {
  if (!value) return "予約サービス不明";
  if (providerLabels[value]) return providerLabels[value];
  return value.startsWith("email_") ? value.slice(6).replaceAll("_", ".") : value;
}

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

function MessageCard({ storeId, message, deleted, manageable }: { storeId: string; message: StoreAiEmailMessage; deleted: boolean; manageable: boolean }) {
  const extracted = message.extracted_data ?? {};
  const pending = !["applied", "ignored", "rejected"].includes(message.processing_status);
  const eventType = message.booking_event_type ?? "created";
  const cancellation = eventType === "cancelled";
  const canLearn = manageable
    && message.known_template
    && !message.matched_template_id
    && Boolean(message.sender_email && message.template_fingerprint);
  return <article className={`card ai-inbox-message category-${message.category}`} id={`message-${message.id}`}>
    <div className="ai-inbox-message-head">
      <div><span className="badge badge-strong">{emailCategoryLabel(message.category)}</span><span className="badge">{statusLabel(message)}</span></div>
      <time>{dateTime.format(new Date(message.received_at))}</time>
    </div>
    <h3>{message.subject}</h3>
    {!message.sensitive ? <p className="muted">{message.sender_name ? `${message.sender_name} ` : ""}{message.sender_email ?? message.sender_domain ?? "送信元不明"}</p> : null}
    {message.category === "reservation" ? <div className="button-row ai-inbox-event-badges">
      <span className="badge badge-strong">{bookingEventLabels[eventType]}</span>
      <span className="badge">{providerLabel(message.booking_provider)}</span>
      {message.matched_template_id ? <span className="badge">学習済み形式と一致</span> : null}
    </div> : null}
    <p>{message.summary}</p>
    <div className="ai-inbox-confidence" aria-label={`分類の確信度${Math.round(Number(message.classification_confidence) * 100)}パーセント`}>
      <span style={{ width: `${Math.round(Number(message.classification_confidence) * 100)}%` }} />
    </div>
    <small className="muted">分類の確信度 {Math.round(Number(message.classification_confidence) * 100)}% ・ {message.classification_reason}</small>

    {message.category === "reservation" && pending && !deleted ? <form className="form ai-inbox-review-form" action={applyReservationAction.bind(null, storeId, message.id)}>
      <div className="section-heading"><div><p className="eyebrow">{bookingEventLabels[eventType]}を反映する前の確認</p><h4>{cancellation ? "キャンセルする予約番号を確認してください" : "足りない部分だけ直してください"}</h4></div></div>
      {message.matched_template_id && message.processing_status === "review_required" ? <p className="notice warning">学習済みの形式と一致しましたが、予約番号の重複・変更対象・日時衝突など安全条件を確認する必要があります。</p> : null}
      <div className={`grid ${cancellation ? "" : "cols-2"}`}>
        <div className="field"><label>予約番号</label><input name="reservation_id" required defaultValue={textValue(extracted.reservation_id)} /></div>
        {!cancellation ? <>
          <div className="field"><label>お客様名</label><input name="customer_name" required defaultValue={textValue(extracted.customer_name)} /></div>
          <div className="field"><label>予約内容</label><input name="service_name" defaultValue={textValue(extracted.service_name)} placeholder="例：アロマトリートメント60分" /></div>
          <div className="field"><label>開始日時</label><input name="starts_at" type="datetime-local" required defaultValue={localDateTimeValue(extracted.starts_at)} /></div>
          <div className="field"><label>終了日時</label><input name="ends_at" type="datetime-local" required defaultValue={localDateTimeValue(extracted.ends_at)} /></div>
          <div className="field"><label>電話番号</label><input name="customer_phone" defaultValue={textValue(extracted.customer_phone)} /></div>
          <div className="field"><label>メール</label><input name="customer_email" type="email" defaultValue={textValue(extracted.customer_email)} /></div>
        </> : <>
          <input type="hidden" name="customer_name" value={textValue(extracted.customer_name)} />
          <input type="hidden" name="service_name" value={textValue(extracted.service_name)} />
          <input type="hidden" name="starts_at" value={textValue(extracted.starts_at)} />
          <input type="hidden" name="ends_at" value={textValue(extracted.ends_at)} />
          <input type="hidden" name="customer_phone" value={textValue(extracted.customer_phone)} />
          <input type="hidden" name="customer_email" value={textValue(extracted.customer_email)} />
        </>}
      </div>
      {canLearn ? <label className="check-row ai-inbox-learn-check"><input type="checkbox" name="learn_template" />今後、この送信元・この形式の「{bookingEventLabels[eventType]}」は質問せず自動処理する</label> : null}
      <PendingSubmitButton pendingLabel="予約台帳へ反映しています...">{cancellation ? "予約キャンセルを反映" : eventType === "changed" ? "予約変更を反映" : "内容を確認して予約へ反映"}</PendingSubmitButton>
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

function TemplateCard({ storeId, template, deleted }: { storeId: string; template: StoreAiEmailTemplate; deleted: boolean }) {
  return <article className="card ai-inbox-template-card">
    <div className="ai-inbox-message-head">
      <div>
        <span className="badge badge-strong">{bookingEventLabels[template.event_type]}</span>
        <span className="badge">{providerLabel(template.provider_key)}</span>
        <span className="badge">{deleted ? "削除済み" : template.status === "active" ? "自動処理中" : "一時停止中"}</span>
      </div>
      <time>登録 {dateTime.format(new Date(template.created_at))}</time>
    </div>
    <h3>{template.sender_email}</h3>
    <p className="muted">この店舗で確認した同じ送信元・媒体・メール構造・通知種類だけに一致します。</p>
    <dl className="ai-inbox-template-metrics">
      <div><dt>確認・一致</dt><dd>{template.match_count}件</dd></div>
      <div><dt>自動処理</dt><dd>{template.auto_processed_count}件</dd></div>
      <div><dt>最終一致</dt><dd>{template.last_matched_at ? dateTime.format(new Date(template.last_matched_at)) : "まだありません"}</dd></div>
    </dl>
    <div className="button-row ai-inbox-secondary-actions">
      {deleted ? <form action={restoreEmailTemplateAction.bind(null, storeId, template.id)}><PendingSubmitButton className="button secondary" pendingLabel="元に戻しています...">停止状態で元に戻す</PendingSubmitButton></form> : <>
        <form action={setEmailTemplateStatusAction.bind(null, storeId, template.id, template.status === "active" ? "paused" : "active")}><PendingSubmitButton className="button secondary" pendingLabel="状態を変更しています...">{template.status === "active" ? "自動処理を一時停止" : "自動処理を再開"}</PendingSubmitButton></form>
        <form action={archiveEmailTemplateAction.bind(null, storeId, template.id)}><ConfirmSubmitButton message="この学習済み形式を削除済みに移します。同じ形式のメールは以後、確認待ちになります。履歴は保持され、あとから元に戻せます。">ルールを削除</ConfirmSubmitButton></form>
      </>}
    </div>
  </article>;
}

export default async function StoreAiInboxPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ view?: string; rules?: string; category?: string; saved?: string; status?: string; rotated?: string; deleted?: string; restored?: string; confirmed?: string; ignored?: string; template_status?: string; template_deleted?: string; template_restored?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const organizationRole = access?.organizationRoles[store.organization_id] ?? "";
  const storeRole = access?.storeRoles[store.id] ?? "";
  const manageable = Boolean(access?.isPlatformAdmin || ["org_owner", "store_manager"].includes(organizationRole) || storeRole === "store_manager");
  const deleted = query.view === "deleted";
  const deletedRules = query.rules === "deleted";
  const category = categories.includes(query.category as StoreEmailCategory) ? query.category as StoreEmailCategory : null;
  const [inboxes, messages, templates] = await Promise.all([
    listStoreAiInboxes(store.id),
    listStoreEmailMessages(store.id, { archived: deleted, category }),
    listStoreEmailTemplates(store.id, deletedRules)
  ]);
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
    {query.template_status ? <p className="notice success">学習済みメール形式の自動処理状態を変更しました。</p> : null}
    {query.template_deleted ? <p className="notice success">学習済みメール形式を削除済みに移しました。以後は確認待ちになります。</p> : null}
    {query.template_restored ? <p className="notice success">学習済みメール形式を停止状態で元に戻しました。</p> : null}
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
          <label className="check-row"><input type="checkbox" name="auto_apply_reservations" defaultChecked={inbox.auto_apply_reservations} />学習済みの予約メール形式を自動処理する</label>
          <p className="muted">最初のメールを人が確認し「今後は自動処理する」と承認した形式だけが対象です。送信元、媒体、メール構造、新規・変更・キャンセルの種類がすべて一致しない場合は確認待ちになります。</p>
          <PendingSubmitButton pendingLabel="安全設定を保存しています...">安全設定を保存</PendingSubmitButton>
        </form>
        <div className="button-row ai-inbox-admin-actions">
          <form action={setInboxStatusAction.bind(null, store.id, inbox.status === "active" ? "paused" : "active")}><PendingSubmitButton className="button secondary" pendingLabel="状態を変更しています...">{inbox.status === "active" ? "受信を一時停止" : "受信を再開"}</PendingSubmitButton></form>
          <form action={rotateInboxAction.bind(null, store.id)}><ConfirmSubmitButton message="受信アドレスを再発行します。以前のアドレスでは新しいメールを受け取れなくなります。受信履歴は保持されます。">受信アドレスを再発行</ConfirmSubmitButton></form>
          <form action={archiveInboxAction.bind(null, store.id)}><ConfirmSubmitButton message="AI受信箱を削除済みに移します。新しいメールの受信は止まりますが、受信履歴と操作履歴は保持され、あとから元に戻せます。">AI受信箱を削除</ConfirmSubmitButton></form>
        </div>
      </details> : null}
    </> : <section className="card"><h2>AI受信箱は現在削除済みです</h2><p>受信履歴は保持されています。店舗オーナー・管理者は、削除済みの受信箱を元に戻せます。</p>{manageable && archivedInboxes[0] ? <form action={restoreInboxAction.bind(null, store.id, archivedInboxes[0].id)}><PendingSubmitButton pendingLabel="元に戻しています...">AI受信箱を元に戻す</PendingSubmitButton></form> : null}</section>}

    {manageable ? <section className="card ai-inbox-ledger" id="learned-email-rules">
      <div className="section-heading">
        <div><p className="eyebrow">店舗ごとの安全な自動処理</p><h2>{deletedRules ? "削除済みの学習ルール" : "学習済みの予約メール形式"}</h2><p>別店舗・別送信元・別の通知種類へは流用されません。形式変更や重複、日時衝突は自動処理せず確認へ戻します。</p></div>
        <Link href={`/stores/${store.id}/ai-inbox?rules=${deletedRules ? "active" : "deleted"}#learned-email-rules`} className="button secondary">{deletedRules ? "使用中へ戻る" : "削除済みを見る"}</Link>
      </div>
      {templates.length ? <div className="ai-inbox-template-list">{templates.map((template) => <TemplateCard storeId={store.id} template={template} deleted={deletedRules} key={template.id} />)}</div> : <div className="booking-empty"><strong>{deletedRules ? "削除済みルールはありません" : "まだ学習した形式はありません"}</strong><p>{deletedRules ? "削除したルールはここから元に戻せます。" : "最初の予約メールを確認するときに、自動処理のチェックを入れるとここへ登録されます。"}</p></div>}
    </section> : null}

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
      {messages.length ? <div className="ai-inbox-message-list">{messages.map((message) => <MessageCard storeId={store.id} message={message} deleted={deleted} manageable={manageable} key={message.id} />)}</div> : <div className="booking-empty"><strong>{deleted ? "削除済みメールはありません" : "まだメールを受信していません"}</strong><p>{deleted ? "削除した受信結果はここから元に戻せます。" : "転送設定後に届いたメールを、AIがここへ整理します。"}</p></div>}
    </section>
  </AppShell>;
}
