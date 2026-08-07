import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { listAdminUsers } from "@/lib/admin/resource-management";
import { archiveAdminUserAction, restoreAdminUserAction } from "../manage-actions";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ view?: string; archived?: string; restored?: string }> }) {
  const query = await searchParams;
  const showArchived = query.view === "archived";
  const users = (await listAdminUsers()).filter((user) => showArchived ? Boolean(user.archivedAt) : !user.archivedAt);
  return (
    <AppShell>
      <PageHeader title="ユーザー管理" description="利用者と所属先を確認し、ログイン権限を削除・元に戻すできます。" />
      {query.archived ? <p className="notice success">ユーザーを削除しました。認証アカウント自体は削除していません。</p> : null}
      {query.restored ? <p className="notice success">ユーザーと所属情報を元に戻しました。</p> : null}
      <div className="button-row"><Link className={`button ${showArchived ? "secondary" : ""}`} href="/admin/users">利用中</Link><Link className={`button ${showArchived ? "" : "secondary"}`} href="/admin/users?view=archived">削除済み</Link></div>
      <section className="card">
        <table className="table">
          <thead><tr><th>ユーザー</th><th>表示名</th><th>権限</th><th>所属組織</th><th>操作</th></tr></thead>
          <tbody>
            {users.map((user) => <tr key={user.userId}>
              <td>{user.email}</td><td>{user.displayName}</td><td>{user.role}</td><td>{user.organizations.join(" / ") || "所属なし"}</td>
              <td>{showArchived ? <form action={restoreAdminUserAction.bind(null, user.userId)}><button className="button secondary" type="submit">元に戻す</button></form> : user.isCurrent ? <span className="badge">現在の管理者</span> : <form action={archiveAdminUserAction.bind(null, user.userId)}><ConfirmSubmitButton message={`${user.email} を削除します。ログインと所属組織へのアクセスが停止しますが、認証アカウントと履歴は削除されません。`}>削除</ConfirmSubmitButton></form>}</td>
            </tr>)}
            {users.length === 0 ? <tr><td colSpan={5}>{showArchived ? "削除済みユーザーはいません。" : "利用中ユーザーはいません。"}</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
