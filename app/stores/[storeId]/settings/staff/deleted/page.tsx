import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { listStoreStaff, storeStaffRoleLabels } from "@/lib/store-staff";
import { restoreStoreStaffAction } from "../actions";

export default async function DeletedStoreStaffPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ restored?: string; error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const { store, memberships } = await listStoreStaff(storeId, true);
  return (
    <AppShell>
      <PageHeader eyebrow={store.name} title="削除済みのスタッフ" description="削除したスタッフを確認し、必要な場合はアクセス権を元に戻せます。" />
      <p><Link href={`/stores/${store.id}/settings/staff`}>← スタッフ一覧へ戻る</Link></p>
      {query.restored ? <p className="notice success">スタッフを元に戻しました。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <section className="card">
        {memberships.length === 0 ? <div className="empty"><h2>削除済みのスタッフはいません</h2></div> : (
          <table className="table"><thead><tr><th>スタッフ</th><th>以前の権限</th><th>操作</th></tr></thead><tbody>{memberships.map((membership) => (
            <tr key={membership.id}><td><strong>{membership.display_name ?? "スタッフ"}</strong><br /><span className="muted">{membership.email}</span></td><td>{storeStaffRoleLabels[membership.role_key]}</td><td><form action={restoreStoreStaffAction.bind(null, store.id, membership.id)}><button className="button secondary" type="submit">元に戻す</button></form></td></tr>
          ))}</tbody></table>
        )}
      </section>
    </AppShell>
  );
}

