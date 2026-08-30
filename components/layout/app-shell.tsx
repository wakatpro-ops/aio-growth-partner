"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AiRobotFace } from "@/components/brand/ai-robot";
import { StoreAiAssistant } from "@/components/store-ai/store-ai-assistant";

const navItems = [
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
  const [storeOptions, setStoreOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [canManageStores, setCanManageStores] = useState(false);
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
    { href: `/stores/${activeStoreId}/sales-hub`, label: "売上" },
    { href: `/stores/${activeStoreId}/inventory`, label: "在庫・仕入" },
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
    setStoreOptions([]);
    setCanManageStores(false);
    if (!activeStoreId) return;

    fetch(`/api/stores/${encodeURIComponent(activeStoreId)}/summary`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.name === "string" && data.name.trim()) {
          setStoreName(data.name.trim());
          setStoreOptions(Array.isArray(data.stores)
            ? data.stores.filter((store: unknown): store is { id: string; name: string } => {
              if (!store || typeof store !== "object") return false;
              const candidate = store as Record<string, unknown>;
              return typeof candidate.id === "string" && typeof candidate.name === "string";
            })
            : []);
          setCanManageStores(Boolean(data.canManageStores));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStoreName(null);
          setStoreOptions([]);
          setCanManageStores(false);
        }
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

  function handleStoreChange(nextStoreId: string) {
    if (!activeStoreId || !nextStoreId || nextStoreId === activeStoreId) return;
    const currentPrefix = `/stores/${activeStoreId}`;
    const currentSection = pathname.startsWith(currentPrefix) ? pathname.slice(currentPrefix.length) : "";
    const portableSections = new Set(["/aio-improvement", "/sales-hub", "/inventory", "/data-imports/ai", "/settings"]);
    const nextSection = portableSections.has(currentSection) ? currentSection : "";
    window.location.href = `/stores/${encodeURIComponent(nextStoreId)}${nextSection}`;
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
        {activeStoreId ? (
          <div className="sidebar-store-switcher">
            <label htmlFor="sidebar_store_switcher">利用店舗</label>
            <select
              id="sidebar_store_switcher"
              value={activeStoreId}
              onChange={(event) => handleStoreChange(event.target.value)}
              disabled={storeOptions.length <= 1}
            >
              {storeOptions.length > 0
                ? storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)
                : <option value={activeStoreId}>{storeName ?? "店舗を確認中"}</option>}
            </select>
            {storeOptions.length > 1 ? <small>担当店舗を切り替えられます</small> : <small>現在の担当店舗</small>}
            {canManageStores ? <Link href="/stores">店舗一覧・追加</Link> : null}
          </div>
        ) : null}
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
        </nav>
        {activeStoreId ? <button className="nav-ai-button" type="button" onClick={() => setAssistantOpen(true)}><AiRobotFace />AIに尋ねる</button> : null}
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
