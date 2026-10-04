"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Keep bookmarked question/rediagnosis links usable even while the tools are folded. */
export function AioFunctionList({ children, alerts }: { children: ReactNode; alerts: number }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      const id = window.location.hash.slice(1);
      const target = id && document.getElementById(id);
      if (target && ref.current?.contains(target)) { ref.current.open = true; target.scrollIntoView({ block: "start" }); }
    };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <details ref={ref} className="aio-function-list"><summary>機能一覧{alerts > 0 ? <span className="badge">確認事項 {alerts}件</span> : null}</summary><div>{children}</div></details>;
}
