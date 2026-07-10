import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/onboarding", label: "初回導入" },
  { href: "/stores", label: "店舗管理" },
  { href: "/settings", label: "設定" },
  { href: "/admin", label: "管理者画面" },
  { href: "/apply", label: "公開申し込み" }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          AIO Growth Partner
        </Link>
        <nav className="nav" aria-label="main">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
