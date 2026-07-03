import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function AdminUsersPage() {
  return (
    <AppShell>
      <PageHeader title="ユーザー管理" description="user_profiles と organization_members を確認します。" />
      <section className="card"><p>Supabase接続後、ユーザー一覧を表示します。</p></section>
    </AppShell>
  );
}
