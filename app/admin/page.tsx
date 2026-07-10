import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

const items = [
  { href: "/admin/applications", label: "申し込み管理" },
  { href: "/admin/users", label: "ユーザー管理" },
  { href: "/admin/organizations", label: "組織管理" },
  { href: "/admin/stores", label: "店舗管理" },
  { href: "/admin/ai-logs", label: "AI利用ログ" },
  { href: "/admin/billing-integrations", label: "課金・外部連携分離" },
  { href: "/settings", label: "プラン・利用状況" }
];

export default function AdminPage() {
  return (
    <AppShell>
      <PageHeader title="管理者画面" description="platform_admin が全体の状態を確認するための運営画面です。" />
      <p className="notice danger">MVP運用では、この画面は管理者だけが使う前提です。Supabase側では platform_admin とRLSで管理者データを制御します。アプリ側の厳密な権限ガードは課金開始前に追加確認してください。</p>
      <div className="grid cols-3">
        {items.map((item) => (
          <Link className="card" key={item.href} href={item.href}>
            <h3>{item.label}</h3>
            <p>詳細を確認する</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
