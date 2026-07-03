import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function AdminAiLogsPage() {
  return (
    <AppShell>
      <PageHeader title="AI利用ログ" description="user_id、organization_id、store_id、template_id、input、output、model、tokens、status、error_message、created_at を保存します。" />
      <section className="card">
        <p>OpenAI APIキーはサーバー側のみで使用し、生成ログは ai_generation_logs に保存します。</p>
      </section>
    </AppShell>
  );
}
