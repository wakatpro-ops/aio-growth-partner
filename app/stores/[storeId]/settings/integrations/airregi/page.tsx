import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getStore } from "@/lib/stores";
import { canManageOrganization } from "@/lib/auth/server";
import { getAirRegiSettings } from "@/lib/airregi/service";
import { transitionAirRegiAction } from "./actions";

export default async function AirRegiSettingsPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>; searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  if (!await canManageOrganization(store.organization_id)) redirect("/forbidden");
  const { connection, ready } = await getAirRegiSettings(storeId);
  const { done, error } = await searchParams;
  const success: Record<string, string> = {
    pause: "自動同期を停止しました。売上履歴は残っています。",
    resume: "自動同期を再開しました。",
    archive: "接続を削除済みに移しました。接続キーは消去し、売上履歴は残しています。",
    restore: "接続を元に戻しました。自動同期の再開には再接続が必要です。"
  };
  return <AppShell>
    <PageHeader title="Airレジ連携" description="今のレジを使い続けて、売上をAIObへ。接続は店舗ごとに管理します。" />
    <p><Link href={`/stores/${storeId}/settings/integrations`}>← 外部連携へ戻る</Link></p>
    {done && success[done] ? <p className="notice success" role="status">{success[done]}</p> : null}
    {error ? <p className="notice danger" role="alert">設定が変わったか、権限または再接続の確認が必要です。画面を開き直してください。</p> : null}
    {!ready ? <section className="card">
      <span className="badge">接続準備中</span>
      <h2>自動連携の準備を進めています</h2>
      <p>Airレジの正式なAPI仕様と利用条件を確認しています。現在はまだ接続・自動取り込みを利用できません。</p>
      <p>接続が利用可能になったら、店舗オーナーがこの店舗のAirレジを指定します。AirIDのパスワードをAIObへ渡す必要はありません。</p>
      <p className="muted">メニュー全件・勤怠の取得や完全リアルタイムの更新は、提供元の対応範囲を確認中です。</p>
    </section> : null}
    {connection && !connection.archived_at ? <section className="card">
      <h2>この店舗の接続</h2>
      <dl className="definition-list">
        <div><dt>Airレジ店舗</dt><dd>{connection.external_store_name}</dd></div>
        <div><dt>状態</dt><dd>{!ready ? "保存済み・同期は準備中" : connection.status === "active" ? "自動同期中" : connection.status === "error" ? "同期の確認が必要" : "停止中"}</dd></div>
        <div><dt>最終取り込み</dt><dd>{connection.last_success_at ? new Date(connection.last_success_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "まだ取り込んでいません"}</dd></div>
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
