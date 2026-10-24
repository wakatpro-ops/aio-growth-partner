import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getStore } from "@/lib/stores";
import { canManageOrganization } from "@/lib/auth/server";
import { getSquareSettings } from "@/lib/square/service";
import { confirmSquareAction, syncSquareAction, transitionSquareAction } from "./actions";

export default async function SquareSettingsPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>; searchParams: Promise<{ pending?: string; done?: string; error?: string }>;
}) {
  const { storeId } = await params, query = await searchParams, store = await getStore(storeId);
  if (!await canManageOrganization(store.organization_id)) redirect("/forbidden");
  const { connection, ready, hasCredentials, pending, environment, organizationName } = await getSquareSettings(storeId, query.pending);
  const messages: Record<string, string> = {
    connected: "この店舗へのSquare連携を設定しました。売上の初回取り込みを開始できます。",
    synced: "Squareの差分を確認し、取得できた売上を反映しました。",
    sync_wait: "直前の処理中、または次回同期まで待機中です。1分ほど待ってから確認してください。",
    pause: "自動同期を停止しました。売上履歴は残っています。",
    resume: "自動同期を再開しました。",
    archive: "接続を削除済みに移しました。接続情報を消去し、売上履歴は残しています。",
    restore: "接続を元に戻しました。自動同期の再開にはSquareへの再接続が必要です。"
  };
  return <AppShell>
    <PageHeader title="Square売上連携" description="今のSquareを使い続けて、売上をAIObへ。接続する店舗を必ず確認します。" />
    <p><Link href={`/stores/${storeId}/settings/integrations`}>← 外部連携へ戻る</Link></p>
    {query.done && messages[query.done] ? <p className="notice success" role="status">{messages[query.done]}</p> : null}
    {query.error ? <p className="notice danger" role="alert">{query.error === "overlap" ? "Squareの売上がCSVから取り込み済みです。二重計上を防ぐため接続を保留しました。再接続を繰り返さず、運営へ切替期間をご相談ください。" : "接続先の重複、権限、設定の変更、またはSquareの応答を確認する必要があります。再接続して店舗を確認してください。"}</p> : null}
    {query.pending && !pending ? <p className="notice danger">接続先の確認期限が切れたか、設定が変わりました。もう一度Squareへ接続してください。</p> : null}
    <section className="card">
      <span className="badge">{environment === "sandbox" ? "テスト環境・架空データのみ" : "読み取り専用"}</span>
      <h2>{store.name} の売上を取り込む</h2>
      <p>対象はSquareで完了した売上と返品・返金・キャンセルです。初回は直近90日、その後は更新された注文を定期確認します。</p>
      <p className="muted">完全なリアルタイムではありません。Square側の反映待ちや障害時は遅れます。商品マスター・在庫数・勤怠の同期、決済・返金操作は行いません。</p>
      {!ready ? <p className="notice">運営側で接続設定を準備しています。この店舗では、まだ自動取り込みを利用できません。</p> : !pending && !connection?.archived_at ? <a className="button" href={`/api/square/oauth/start?storeId=${storeId}`}>{connection ? "Squareを再接続" : "Squareを接続する"}</a> : null}
    </section>
    {pending ? <section className="card">
      <h2>このAIOb店舗に、どのSquare店舗を接続しますか？</h2>
      <p>AIObの契約法人：<strong>{organizationName}</strong></p>
      <p><strong>AIObの店舗：{store.name}</strong></p>
      <form action={confirmSquareAction.bind(null, storeId, pending.id)} className="form-stack">
        <label>Squareの店舗<select name="location" required defaultValue=""><option value="" disabled>店舗を選んでください</option>{pending.locations.map(location => <option key={location.id} value={location.id}>{location.name}（{location.id}）</option>)}</select></label>
        <label><input type="checkbox" name="confirmed" value="yes" required /> このAIOb店舗とSquare店舗が同じ店舗であることを確認しました</label>
        <label><input type="checkbox" name="no_overlap" value="yes" required /> 直近90日の同じSquare売上を、CSVなどから取り込んでいないことを確認しました</label>
        <p className="muted">取り込み済みの場合は、同じ売上を二重登録しないよう、接続前に運営へ切替期間をご相談ください。</p>
        <div className="actions-row"><PendingSubmitButton>この店舗への接続を確定</PendingSubmitButton><Link className="button secondary" href={`/stores/${storeId}/settings/integrations/square`}>接続せず戻る</Link></div>
      </form>
    </section> : null}
    {connection && !connection.archived_at ? <section className="card">
      <h2>この店舗の接続</h2>
      <dl className="definition-list">
        <div><dt>Square店舗</dt><dd>{connection.external_store_name}</dd></div>
        <div><dt>状態</dt><dd>{!ready ? "保存済み・同期は無効" : !hasCredentials ? "再接続が必要" : connection.status === "active" ? connection.cursor ? "初回・差分取り込み中" : "自動同期中" : connection.status === "error" ? "再試行待ち" : "停止中"}</dd></div>
        <div><dt>最終取り込み</dt><dd>{connection.last_success_at ? new Date(connection.last_success_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "まだ取り込んでいません"}</dd></div>
      </dl>
      {connection.last_error_code ? <p className="notice danger">{connection.last_error_code === "square_reconnect_required" || connection.last_error_code === "authorization_revoked" ? "接続を許可したアカウントの権限・有効期限を確認して、Squareを再接続してください。" : "Squareの同期で確認が必要です。未確認のデータは反映せず、前回までの売上を保持しています。"}</p> : null}
      <div className="actions-row">
        {ready && hasCredentials && ["active", "error"].includes(connection.status) ? <form action={syncSquareAction.bind(null, storeId)}><PendingSubmitButton>売上を取り込む</PendingSubmitButton></form> : null}
        {["active", "error"].includes(connection.status) ? <form action={transitionSquareAction.bind(null, storeId, connection.id, "pause", connection.revision)}><PendingSubmitButton className="button secondary">自動同期を停止</PendingSubmitButton></form> : ready && hasCredentials ? <form action={transitionSquareAction.bind(null, storeId, connection.id, "resume", connection.revision)}><PendingSubmitButton>自動同期を再開</PendingSubmitButton></form> : null}
        <form action={transitionSquareAction.bind(null, storeId, connection.id, "archive", connection.revision)}><ConfirmSubmitButton message="Square接続を削除済みに移し、AIOb内の接続情報を消去します。取り込んだ売上と同期履歴は残ります。Squareアプリ全体の許可は解除しません。よろしいですか？">接続を削除</ConfirmSubmitButton></form>
        <Link className="button secondary" href={`/stores/${storeId}/sales-hub`}>売上を確認</Link>
      </div>
    </section> : connection?.archived_at ? <details className="card"><summary>削除済みの接続</summary><p>{connection.external_store_name}</p><p>取り込んだ売上・同期履歴は残っています。元に戻しても、自動同期は再開しません。</p><form action={transitionSquareAction.bind(null, storeId, connection.id, "restore", connection.revision)}><PendingSubmitButton className="button secondary">元に戻す</PendingSubmitButton></form></details> : null}
  </AppShell>;
}
