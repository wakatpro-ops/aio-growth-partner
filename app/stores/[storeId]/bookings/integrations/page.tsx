import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import { listExternalBookingConnections } from "@/lib/bookings/external-connections";
import {
  externalBookingProviders,
  externalBookingStatusLabels,
  userSelectableExternalBookingStatuses
} from "@/lib/bookings/external-providers";
import { getStore } from "@/lib/stores";
import type { ExternalBookingConnection } from "@/types/external-booking";
import {
  archiveExternalBookingConnectionAction,
  confirmExternalBookingReadConnectionAction,
  restoreExternalBookingConnectionAction,
  startExternalBookingConnectionAction,
  updateExternalBookingConnectionAction
} from "./actions";

const modeLabels = {
  official_read_api: "公式API",
  contract_api: "個別契約API",
  partner_inquiry: "提携照会",
  file_import: "ファイル取込"
} as const;

function formatDateTime(value: string | null) {
  if (!value) return "未実施";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function ConnectionForm({ storeId, connection }: { storeId: string; connection: ExternalBookingConnection }) {
  return <form className="form external-booking-form" action={updateExternalBookingConnectionAction.bind(null, storeId, connection.id)}>
    <div className="grid cols-2">
      <div className="field"><label htmlFor={`status-${connection.id}`}>現在の状況</label><select id={`status-${connection.id}`} name="status" defaultValue={connection.status}>
        {userSelectableExternalBookingStatuses.map((status) => <option value={status} key={status}>{externalBookingStatusLabels[status]}</option>)}
      </select></div>
      <div className="field"><label htmlFor={`account-${connection.id}`}>媒体側の店舗・アカウント名</label><input id={`account-${connection.id}`} name="external_account_label" defaultValue={connection.external_account_label ?? ""} placeholder="例：ナナ（nana）" /></div>
      <div className="field"><label htmlFor={`external-store-${connection.id}`}>媒体側の店舗ID</label><input id={`external-store-${connection.id}`} name="external_store_id" defaultValue={connection.external_store_id ?? ""} placeholder="分かる場合だけ入力" /></div>
      <div className="field"><label htmlFor={`plan-${connection.id}`}>契約プラン</label><input id={`plan-${connection.id}`} name="contracted_plan" defaultValue={connection.contracted_plan ?? ""} placeholder="例：ビジネスプラン／未確認" /></div>
    </div>
    <div className="field"><label htmlFor={`notes-${connection.id}`}>提供会社への確認事項・回答</label><textarea id={`notes-${connection.id}`} name="notes" defaultValue={connection.notes ?? ""} placeholder="申請番号、担当者からの回答、次に必要な操作など。パスワードやAPIキーは入力しないでください。" /></div>
    <div className="button-row"><PendingSubmitButton pendingLabel="接続準備を保存しています...">接続準備を保存</PendingSubmitButton></div>
  </form>;
}

export default async function ExternalBookingIntegrationsPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ started?: string; saved?: string; connected?: string; deleted?: string; restored?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) notFound();
  const [connections, access] = await Promise.all([listExternalBookingConnections(store.id), getCurrentUserAccess()]);
  const active = new Map(connections.filter((item) => !item.archived_at).map((item) => [item.provider_key, item]));
  const archived = connections.filter((item) => item.archived_at);

  return <AppShell>
    <PageHeader
      eyebrow="予約・外部連携"
      title="予約サービスをまとめて確認"
      description="現在の予約サービスを止めず、公式API・提携申請・ファイル取込の順で、安全にAIO boostへ集約します。"
      action={<Link className="button secondary" href={`/stores/${store.id}/bookings`}>予約へ戻る</Link>}
    />
    {query.started ? <p className="notice success">接続準備を開始しました。提供会社への申請や契約が必要な場合は、回答を受けてから次へ進みます。</p> : null}
    {query.saved ? <p className="notice success">接続準備の状態を保存しました。</p> : null}
    {query.connected ? <p className="notice success">提供会社の許諾、対象店舗、読み取りテストを確認し、この店舗へ読み取り専用で接続しました。</p> : null}
    {query.deleted ? <p className="notice success">接続準備を削除済みに移しました。履歴は保持され、元に戻せます。</p> : null}
    {query.restored ? <p className="notice success">接続準備を元に戻しました。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

    <section className="external-booking-summary">
      <article><strong>1社</strong><span>公式の読み取りAPI</span><small>STORES 予約</small></article>
      <article><strong>1社</strong><span>個別契約のAPI</span><small>RESERVA</small></article>
      <article><strong>6社</strong><span>提携可否の確認が必要</span><small>公開APIは未確認</small></article>
    </section>
    <p className="notice warning">「接続準備」は外部サービスの契約や設定を変更しません。APIキー、パスワード、二段階認証コードはこの画面へ入力しないでください。実際の接続は、提供会社の許諾と読み取りテストが完了した媒体だけ開放します。</p>

    <section className="external-booking-grid">
      {externalBookingProviders.map((provider) => {
        const connection = active.get(provider.key);
        return <article className="card external-booking-card" key={provider.key}>
          <div className="external-booking-card-heading"><div><p className="eyebrow">{modeLabels[provider.mode]}</p><h2>{provider.name}</h2></div><span className={`badge ${provider.key === "stores_reservation" ? "badge-strong" : ""}`}>{provider.availabilityLabel}</span></div>
          <p>{provider.summary}</p>
          <div className="external-booking-capabilities" aria-label={`${provider.name}の確認済み機能`}>
            <span>予約取得：{provider.capabilities.reservations === "read" ? "可能" : provider.capabilities.reservations === "contract" ? "契約後" : "要確認"}</span>
            <span>顧客取得：{provider.capabilities.customers === "read" ? "可能" : provider.capabilities.customers === "contract" ? "契約後" : "要確認"}</span>
            <span>書き戻し：行わない</span>
          </div>
          <details><summary>接続に必要な確認</summary><ul>{provider.requirements.map((item) => <li key={item}>{item}</li>)}</ul></details>
          <div className="button-row"><a className="button secondary" href={provider.officialUrl} target="_blank" rel="noreferrer">公式情報を確認</a><a className="text-link" href={provider.inquiryUrl} target="_blank" rel="noreferrer">申請・問い合わせ先</a></div>

          {connection ? <div className="external-booking-progress">
            <div className="section-heading"><div><p className="eyebrow">この店舗の状況</p><h3>{externalBookingStatusLabels[connection.status]}</h3></div><small>更新 {formatDateTime(connection.updated_at)}</small></div>
            <ConnectionForm storeId={store.id} connection={connection} />
            {access?.isPlatformAdmin && ["credentials_required", "connection_test_required"].includes(connection.status) ? <form className="form external-booking-verification" action={confirmExternalBookingReadConnectionAction.bind(null, store.id, connection.id)}>
              <strong>運営管理者の接続確認</strong>
              <label className="check-row"><input name="provider_permission_verified" type="checkbox" />提供会社からAPI利用とデータ取得の許諾を受けました</label>
              <label className="check-row"><input name="store_match_verified" type="checkbox" />API情報の対象店舗が、このAIO boost店舗と一致しています</label>
              <label className="check-row"><input name="read_test_verified" type="checkbox" />予約を1件以上読み取り、外部へ書き戻していないことを確認しました</label>
              <ConfirmSubmitButton message="3点を実環境で確認し、この店舗の読み取り接続を有効にします。">読み取り接続を確定</ConfirmSubmitButton>
            </form> : null}
            <form action={archiveExternalBookingConnectionAction.bind(null, store.id, connection.id)}><ConfirmSubmitButton className="button secondary" message={`${provider.name}の接続準備を削除済みに移します。申請・接続・同期の履歴は保持されます。`}>接続準備を削除</ConfirmSubmitButton></form>
          </div> : <form className="form external-booking-start" action={startExternalBookingConnectionAction.bind(null, store.id, provider.key)}>
            <div className="grid cols-2">
              <div className="field"><label htmlFor={`account-${provider.key}`}>媒体側の店舗・アカウント名</label><input id={`account-${provider.key}`} name="external_account_label" placeholder="分かる範囲で入力" /></div>
              <div className="field"><label htmlFor={`plan-${provider.key}`}>契約プラン</label><input id={`plan-${provider.key}`} name="contracted_plan" placeholder="未契約・不明でも開始できます" /></div>
            </div>
            <input type="hidden" name="external_store_id" value="" />
            <input type="hidden" name="notes" value="" />
            <label className="check-row"><input name="owner_authorized" type="checkbox" />この店舗の予約サービスについて、接続可否の確認と申請準備を行う権限があります</label>
            <PendingSubmitButton pendingLabel="接続準備を開始しています...">接続準備を始める</PendingSubmitButton>
          </form>}
        </article>;
      })}
    </section>

    {archived.length ? <section className="card booking-config-list"><div className="section-heading"><div><p className="eyebrow">削除済み</p><h2>元に戻せる接続準備</h2></div></div>{archived.map((connection) => {
      const provider = externalBookingProviders.find((item) => item.key === connection.provider_key);
      return <div className="booking-config-row" key={connection.id}><div><strong>{provider?.name ?? connection.provider_key}</strong><small>{formatDateTime(connection.archived_at)}に削除・申請と同期の履歴は保持</small></div>{active.has(connection.provider_key) ? <span className="badge">進行中の接続があります</span> : <form action={restoreExternalBookingConnectionAction.bind(null, store.id, connection.id)}><ConfirmSubmitButton className="button secondary" message={`${provider?.name ?? "外部予約サービス"}の接続準備を元に戻しますか？`}>元に戻す</ConfirmSubmitButton></form>}</div>;
    })}</section> : null}
  </AppShell>;
}
