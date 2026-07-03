import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function AdminApplicationsPage() {
  return (
    <AppShell>
      <PageHeader title="申し込み管理" description="公開フォームから送信された applications を確認します。" />
      <section className="card">
        <p>Supabase接続後、applications の一覧を表示します。</p>
      </section>
    </AppShell>
  );
}
