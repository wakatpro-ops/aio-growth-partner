import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { listStoreStaff, storeStaffRoles } from "@/lib/store-staff";
import { inviteStoreStaffAction } from "../actions";

export default async function NewStoreStaffPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const { store } = await listStoreStaff(storeId);
  return (
    <AppShell>
      <PageHeader eyebrow={store.name} title="スタッフを追加" description="名前・メールアドレス・権限を指定して、この店舗だけを利用できるアカウントを発行します。" />
      <p><Link href={`/stores/${store.id}/settings/staff`}>← スタッフ一覧へ戻る</Link></p>
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <form className="card form" action={inviteStoreStaffAction.bind(null, store.id)}>
        <div className="field"><label htmlFor="display_name">スタッフ名</label><input id="display_name" name="display_name" required autoComplete="name" placeholder="例: 山田 花子" /></div>
        <div className="field"><label htmlFor="email">メールアドレス</label><input id="email" name="email" type="email" required autoComplete="email" placeholder="staff@example.com" /></div>
        <div className="field"><label htmlFor="role_key">この店舗での権限</label><select id="role_key" name="role_key" defaultValue="staff">{storeStaffRoles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className="notice"><strong>アクセスできる範囲</strong><p>招待された人には「{store.name}」だけが表示されます。他の店舗やスタッフ管理、店舗の追加・削除はできません。</p></div>
        <PendingSubmitButton pendingLabel="アカウントを発行しています...">アカウントを発行して招待</PendingSubmitButton>
      </form>
    </AppShell>
  );
}

