import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { listStoreStaff, storeStaffRoles } from "@/lib/store-staff";
import { archiveStoreStaffAction, resendStoreStaffInviteAction, updateStoreStaffAction } from "./actions";

export default async function StoreStaffPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ invited?: string; updated?: string; deleted?: string; resent?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const { store, memberships } = await listStoreStaff(storeId);
  return (
    <AppShell>
      <PageHeader eyebrow={store.name} title="スタッフアカウント" description="この店舗だけを利用できるスタッフを招待し、権限を管理します。"
        action={<Link className="button" href={`/stores/${store.id}/settings/staff/new`}>スタッフを追加</Link>} />
      <StoreBusinessNav store={store} />
      <p><Link href={`/stores/${store.id}/settings`}>← 設定へ戻る</Link></p>
      {query.invited ? <p className="notice success">スタッフを追加し、招待メールを送信しました。</p> : null}
      {query.updated ? <p className="notice success">スタッフの権限を変更しました。</p> : null}
      {query.deleted ? <p className="notice success">スタッフを削除しました。アカウント情報は保持され、あとから元に戻せます。</p> : null}
      {query.resent ? <p className="notice success">招待メールを再送しました。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <div className="button-row">
        <Link className="button secondary" href={`/stores/${store.id}/settings/staff/deleted`}>削除済みを見る</Link>
      </div>
      <section className="card">
        <h2>利用中のスタッフ</h2>
        {memberships.length === 0 ? (
          <div className="empty"><h3>スタッフはまだ登録されていません</h3><p>スタッフを追加すると、その人はこの店舗だけを利用できます。</p><Link className="button" href={`/stores/${store.id}/settings/staff/new`}>最初のスタッフを追加</Link></div>
        ) : (
          <table className="table">
            <thead><tr><th>スタッフ</th><th>権限</th><th>招待状況</th><th>操作</th></tr></thead>
            <tbody>{memberships.map((membership) => (
              <tr key={membership.id}>
                <td><strong>{membership.display_name ?? "スタッフ"}</strong><br /><span className="muted">{membership.email}</span></td>
                <td>
                  <form className="button-row" action={updateStoreStaffAction.bind(null, store.id, membership.id)}>
                    <select name="role_key" defaultValue={membership.role_key} aria-label={`${membership.display_name ?? membership.email}の権限`}>
                      {storeStaffRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <PendingSubmitButton className="button secondary" pendingLabel="権限を保存しています...">権限を保存</PendingSubmitButton>
                  </form>
                </td>
                <td><span className="badge">{membership.invitation_status === "accepted" ? "利用開始済み" : membership.email_status === "failed" ? "送信失敗" : "招待送信済み"}</span></td>
                <td><div className="button-row">
                  <form action={resendStoreStaffInviteAction.bind(null, store.id, membership.id)}><PendingSubmitButton className="button secondary" pendingLabel="招待を再送しています...">招待を再送</PendingSubmitButton></form>
                  <form action={archiveStoreStaffAction.bind(null, store.id, membership.id)}><ConfirmSubmitButton message={`「${membership.display_name ?? membership.email}」をこの店舗のスタッフから削除します。すぐにこの店舗へアクセスできなくなります。`}>削除</ConfirmSubmitButton></form>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="muted">店舗管理者とスタッフは登録・編集ができ、閲覧のみは内容の確認だけができます。スタッフの削除はデータを消去せず、アクセス権だけを停止します。</p>
      </section>
    </AppShell>
  );
}
