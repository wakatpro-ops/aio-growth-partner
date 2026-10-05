"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Keep bookmarked question/rediagnosis links usable even while the tools are folded. */
export function AioFunctionList({ children, alerts, badge }: { children: ReactNode; alerts: number; badge?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = (hash = window.location.hash) => {
      const id = hash.slice(1);
      const target = id && document.getElementById(id);
      if (target && ref.current?.contains(target)) { ref.current.open = true; target.scrollIntoView({ block: "start" }); }
    };
    const onHashChange = () => reveal();
    // Next Link uses pushState (no hashchange). Also reopen a folded section
    // when the URL already has the same hash, without changing navigation.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const url = new URL(anchor.getAttribute("href")!, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) reveal(url.hash);
    };
    reveal(); window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("hashchange", onHashChange); document.removeEventListener("click", onClick, true); };
  }, []);
  return <details ref={ref} className="aio-function-list"><summary>機能一覧{badge || alerts > 0 ? <span className="badge">{badge ?? `確認事項 ${alerts}件`}</span> : null}</summary><div>{children}</div></details>;
}
