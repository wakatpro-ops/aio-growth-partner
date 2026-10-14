import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

const items = [
  { href: "/admin/users", label: "ユーザー管理" },
  { href: "/admin/organizations", label: "組織管理" },
  { href: "/admin/stores", label: "店舗管理" },
  { href: "/admin/ai-logs", label: "AI利用料・稼働状況" },
  { href: "/admin/billing-integrations", label: "課金・外部連携分離" },
  { href: "/admin/beta-release", label: "βリリース運用" },
  { href: "/admin/first-customer-ready", label: "1社目導入前チェック" },
  { href: "/beta-onboarding", label: "β導入パック" },
  { href: "/settings", label: "プラン・利用状況" }
];

export default function AdminPage() {
  return (
    <AppShell>
      <PageHeader title="運営トップ" description="申し込みの確認と、利用中の店舗・アカウントを管理します。" />
      <section className="card">
        <p className="eyebrow">申し込みへの対応</p><h2>申込を確認して、利用開始へ</h2>
        <p>確認の進み具合と、次に必要な操作を申込ごとに確認できます。</p>
        <Link className="button" href="/admin/applications?view=pending">対応が必要な申込を確認する</Link>
      </section>
      <h2>利用中の店舗・アカウント</h2>
      <div className="grid cols-3">
        {items.slice(0, 4).map((item) => (
          <Link className="card" key={item.href} href={item.href}>
            <h3>{item.label}</h3>
            <p>詳細を確認する</p>
          </Link>
        ))}
      </div>
      <details className="card disclosure"><summary>運用設定・導入チェック</summary><div className="grid cols-3">
        {items.slice(4).map(item => <Link className="card" key={item.href} href={item.href}><h3>{item.label}</h3><p>設定・運用を確認する</p></Link>)}
      </div></details>
    </AppShell>
  );
}
