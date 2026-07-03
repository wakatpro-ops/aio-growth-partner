import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function AdminOrganizationsPage() {
  return (
    <AppShell>
      <PageHeader title="組織管理" description="organizations、plan_limits、外部連携ステータスを確認します。" />
      <section className="card"><p>Supabase接続後、組織一覧を表示します。</p></section>
    </AppShell>
  );
}
