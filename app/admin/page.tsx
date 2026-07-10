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
  { href: "/admin/beta-release", label: "βリリース運用" },
  { href: "/admin/first-customer-ready", label: "1社目導入前チェック" },
  { href: "/beta-onboarding", label: "β導入パック" },
  { href: "/settings", label: "プラン・利用状況" }
];

export default function AdminPage() {
  return (
    <AppShell>
      <PageHeader title="管理者画面" description="platform_admin が全体の状態を確認するための運営画面です。" />
      <p className="notice success">この配下の画面はサーバー側で platform_admin を確認します。一般ユーザーは管理者画面を表示できません。</p>
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
