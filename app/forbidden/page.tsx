import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function ForbiddenPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="権限なし"
        title="この画面を表示する権限がありません"
        description="管理者専用画面、または所属店舗以外のデータにアクセスしようとしています。必要な場合は管理者に権限を確認してください。"
      />
      <section className="card">
        <h2>次にできること</h2>
        <p>通常の店舗業務画面へ戻るか、管理者アカウントでログインし直してください。</p>
        <div className="button-row">
          <Link className="button" href="/dashboard">ダッシュボードへ</Link>
          <Link className="button secondary" href="/login">ログインへ</Link>
        </div>
      </section>
    </AppShell>
  );
}
