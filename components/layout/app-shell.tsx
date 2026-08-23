"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StoreAiAssistant } from "@/components/store-ai/store-ai-assistant";

const navItems = [
  { href: "/dashboard", label: "ホーム" },
  { href: "/stores", label: "店舗を選ぶ" },
  { href: "/onboarding", label: "はじめての方へ" },
  { href: "/settings", label: "アカウント設定" }
];

const footerLinks = [
  { href: "/help", label: "操作方法" },
  { href: "/legal", label: "規約・ポリシー" },
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシー" },
  { href: "/beta-notes", label: "利用時の注意" }
];

const adminItems = [
  { href: "/admin", label: "管理者トップ" },
  { href: "/admin/applications", label: "申込管理" }
];

const publicPaths = ["/", "/apply", "/login", "/terms", "/privacy", "/legal", "/help", "/beta-notes"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [storeName, setStoreName] = useState<string | null>(null);
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const showSignOut = !publicPaths.includes(pathname);
  const activeStoreId = useMemo(() => {
    const match = pathname.match(/^\/stores\/([^/]+)/);
    if (!match || match[1] === "new") return null;
    return decodeURIComponent(match[1]);
  }, [pathname]);
  const visibleNavItems = activeStoreId ? [
    { href: `/stores/${activeStoreId}`, label: "店舗トップ" },
    { href: `/stores/${activeStoreId}/aio-improvement`, label: "AIO改善" },
    { href: `/stores/${activeStoreId}/acquisition`, label: "集客" },
    { href: `/stores/${activeStoreId}/sales-hub`, label: "売上" },
    { href: `/stores/${activeStoreId}/data-imports/ai`, label: "データ取り込み" },
    { href: `/stores/${activeStoreId}/settings`, label: "設定" }
  ] : navItems;
  const backHref = useMemo(() => {
    if (!activeStoreId || pathname === `/stores/${activeStoreId}`) return null;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 3) return `/stores/${activeStoreId}`;
    parts.pop();
    return `/${parts.join("/")}`;
  }, [activeStoreId, pathname]);

  useEffect(() => {
    let cancelled = false;
    setStoreName(null);
    if (!activeStoreId) return;

    fetch(`/api/stores/${encodeURIComponent(activeStoreId)}/summary`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.name === "string" && data.name.trim()) {
          setStoreName(data.name.trim());
        }
      })
      .catch(() => {
        if (!cancelled) setStoreName(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeStoreId]);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href={activeStoreId ? `/stores/${activeStoreId}` : "/"}>
          {storeName ? (
            <>
              <span className="brand-kicker">AIO boost</span>
              <span className="brand-name">{storeName}</span>
            </>
          ) : (
            "AIO boost"
          )}
        </Link>
        <nav className="nav" aria-label="main">
          {visibleNavItems.map((item) => {
            const active = pathname === item.href || (item.href !== `/stores/${activeStoreId}` && pathname.startsWith(`${item.href}/`));
            return (
              <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} key={item.href} href={item.href}>
                {item.label}
              </Link>
            );
          })}
          {isAdminArea ? (
            <>
              <div className="nav-section-label">管理者メニュー</div>
              {adminItems.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                );
              })}
            </>
          ) : null}
          {activeStoreId ? <button className="nav-ai-button" type="button" onClick={() => setAssistantOpen(true)}><span aria-hidden="true">AI</span>AIに尋ねる</button> : null}
        </nav>
        <footer className="sidebar-footer">
          {showSignOut ? (
            <button className="sidebar-signout" type="button" onClick={handleSignOut} disabled={isSigningOut} aria-busy={isSigningOut}>
              {isSigningOut ? "ログアウト中..." : "ログアウト"}
            </button>
          ) : null}
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </footer>
      </aside>
      <main className="main">
        {backHref ? <Link className="back-link" href={backHref}>← 前の画面へ戻る</Link> : null}
        {children}
      </main>
      {activeStoreId ? <StoreAiAssistant storeId={activeStoreId} pathname={pathname} open={assistantOpen} onClose={() => setAssistantOpen(false)} /> : null}
    </div>
  );
}
