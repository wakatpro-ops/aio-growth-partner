import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getStore } from "@/lib/stores";
import { canManageOrganization } from "@/lib/auth/server";
import { getAirRegiSettings } from "@/lib/airregi/service";
import { AirRegiConnectForm } from "@/components/integrations/airregi-connect-form";
import { connectAirRegiAction, transitionAirRegiAction } from "./actions";

export default async function AirRegiSettingsPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>; searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  if (!await canManageOrganization(store.organization_id)) redirect("/forbidden");
  const { connection, ready } = await getAirRegiSettings(storeId);
  const { done, error } = await searchParams;
  const success: Record<string, string> = {
    connect: "Airレジの接続を保存しました。売上は順に取り込みます。",
    pause: "自動同期を停止しました。売上履歴は残っています。",
    resume: "自動同期を再開しました。",
    archive: "接続を削除済みに移しました。接続キーは消去し、売上履歴は残しています。",
    restore: "接続を元に戻しました。自動同期の再開には再接続が必要です。"
  };
  const syncErrors: Record<string, string> = {
    authentication_required: "接続情報が無効になっています。Airレジ側のAPI設定を確認し、再接続してください。",
    ip_not_registered: "接続環境の登録確認が必要です。AIOb運営へお問い合わせください。",
    accounting_review_required: "会計修正の金額を確認するため、取り込みを停止しています。売上を推測で変更せず、AIOb運営で確認します。",
    history_expired: "未取得の期間が取得可能範囲を超えています。売上を取りこぼさないよう、AIOb運営へお問い合わせください。",
    store_mismatch: "接続先の店舗が一致しないため、取り込みを停止しました。店舗番号を確認してください。",
    rate_limited: "Airレジの待機時間を守って、後ほど自動で再確認します。"
  };
  return <AppShell>
    <PageHeader title="Airレジ連携" description="今のレジを使い続けて、売上をAIObへ。接続は店舗ごとに管理します。" />
    <p><Link href={`/stores/${storeId}/settings/integrations`}>← 外部連携へ戻る</Link></p>
    {done && success[done] ? <p className="notice success" role="status">{success[done]}</p> : null}
    {error ? <p className="notice danger" role="alert">設定が変わったか、権限または再接続の確認が必要です。画面を開き直してください。</p> : null}
    {!ready ? <section className="card">
      <span className="badge">接続準備中</span>
      <h2>自動連携の準備を進めています</h2>
      <p>正式仕様を確認し、接続環境と動作検証を準備しています。現在はまだ接続・自動取り込みを利用できません。</p>
      <p>接続が利用可能になったら、店舗オーナーがこの店舗のAirレジを指定します。AirIDのパスワードをAIObへ渡す必要はありません。</p>
      <p className="muted">対象は売上の読み取りです。メニュー全件・勤怠は対象外で、完全リアルタイムではありません。</p>
    </section> : null}
    {ready && !connection?.archived_at ? connection?.status === "active" ? <details className="card"><summary>接続情報を更新する</summary><AirRegiConnectForm key={storeId} storeId={storeId} storeName={store.name} action={connectAirRegiAction} /></details> : <section className="card"><AirRegiConnectForm key={storeId} storeId={storeId} storeName={store.name} action={connectAirRegiAction} /></section> : null}
    {connection && !connection.archived_at ? <section className="card">
      <h2>この店舗の接続</h2>
      {connection.last_error_code ? <p role="alert" className="notice danger">{syncErrors[connection.last_error_code] ?? "取り込みを確認できませんでした。売上履歴は残っています。時間をおいても直らない場合はAIOb運営へお問い合わせください。"}</p> : null}
      <dl className="definition-list">
        <div><dt>Airレジ店舗</dt><dd>{connection.external_store_name}</dd></div>
        <div><dt>状態</dt><dd>{!ready ? "保存済み・同期は準備中" : connection.status === "active" ? "自動同期中" : connection.status === "error" ? "同期の確認が必要" : "停止中"}</dd></div>
        <div><dt>最終取り込み</dt><dd>{connection.last_success_at ? new Date(connection.last_success_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "まだ取り込んでいません"}</dd></div>
        <div><dt>取り込み状況</dt><dd>{connection.cursor ? "過去の売上を順に取り込んでいます" : connection.watermark ? "差分を確認します" : "初回の取り込み待ち"}</dd></div>
      </dl>
      <div className="actions-row">
        {connection.status === "active" || connection.status === "error" ? <form action={transitionAirRegiAction.bind(null, storeId, connection.id, "pause", connection.revision)}><PendingSubmitButton className="button secondary">自動同期を停止</PendingSubmitButton></form> : ready ? <form action={transitionAirRegiAction.bind(null, storeId, connection.id, "resume", connection.revision)}><PendingSubmitButton>自動同期を再開</PendingSubmitButton></form> : null}
        <form action={transitionAirRegiAction.bind(null, storeId, connection.id, "archive", connection.revision)}><ConfirmSubmitButton message="Airレジの接続を削除済みに移します。接続キーは消去しますが、取り込んだ売上と同期履歴は残ります。Airレジ側のキーは失効しません。よろしいですか？">接続を削除</ConfirmSubmitButton></form>
      </div>
    </section> : connection?.archived_at ? <details className="card"><summary>削除済みの接続</summary>
      <p>{connection.external_store_name}</p><p>取り込んだ売上と同期履歴は残っています。元に戻しても、自動同期は再開しません。</p>
      <form action={transitionAirRegiAction.bind(null, storeId, connection.id, "restore", connection.revision)}><PendingSubmitButton className="button secondary">元に戻す</PendingSubmitButton></form>
    </details> : null}
  </AppShell>;
}
