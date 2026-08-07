import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { listAdminOrganizations } from "@/lib/admin/resource-management";
import { archiveAdminOrganizationAction, restoreAdminOrganizationAction } from "../manage-actions";

export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<{ view?: string; archived?: string; restored?: string }> }) {
  const query = await searchParams;
  const showArchived = query.view === "archived";
  const organizations = (await listAdminOrganizations()).filter((organization) => showArchived ? Boolean(organization.archivedAt) : !organization.archivedAt);
  return (
    <AppShell>
      <PageHeader title="組織管理" description="契約組織、所属ユーザー、店舗数を確認し、利用終了した組織を削除できます。" />
      {query.archived ? <p className="notice success">組織を削除しました。</p> : null}
      {query.restored ? <p className="notice success">組織を元に戻しました。</p> : null}
      <div className="button-row"><Link className={`button ${showArchived ? "secondary" : ""}`} href="/admin/organizations">利用中</Link><Link className={`button ${showArchived ? "" : "secondary"}`} href="/admin/organizations?view=archived">削除済み</Link></div>
      <section className="card">
        <table className="table">
          <thead><tr><th>組織名</th><th>プラン</th><th>利用中店舗</th><th>所属ユーザー</th><th>操作</th></tr></thead>
          <tbody>
            {organizations.map((organization) => <tr key={organization.id}>
              <td>{organization.name}</td><td>{organization.planKey ?? "未設定"}</td><td>{organization.activeStoreCount}</td><td>{organization.memberCount}</td>
              <td>{showArchived ? <form action={restoreAdminOrganizationAction.bind(null, organization.id)}><button className="button secondary" type="submit">元に戻す</button></form> : <form action={archiveAdminOrganizationAction.bind(null, organization.id)}><ConfirmSubmitButton message={`「${organization.name}」を削除します。所属する利用中店舗がある場合は先に店舗を削除してください。`}>削除</ConfirmSubmitButton></form>}</td>
            </tr>)}
            {organizations.length === 0 ? <tr><td colSpan={5}>{showArchived ? "削除済み組織はありません。" : "利用中組織はありません。"}</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
