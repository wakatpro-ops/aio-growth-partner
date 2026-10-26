"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function SalesHubTabs({ summary, sales, accounting }: { summary: ReactNode; sales: ReactNode; accounting: ReactNode }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const active = query.get("tab") === "accounting" ? "accounting" : "sales";
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  function select(tab: string) {
    const params = new URLSearchParams(query.toString());
    params.set("tab", tab);
    window.history.replaceState(null, "", `${pathname}?${params}`);
  }
  return <div className="sales-hub-workspace">
    <div className="sales-hub-tabs" role="tablist" aria-label="売上・経理の切り替え">
      {[["sales", "売上概要"], ["accounting", "経理"]].map(([tab, label], index) => <button key={tab} ref={el => { buttons.current[index] = el; }} type="button" role="tab" id={`sales-hub-tab-${tab}`} aria-controls={`sales-hub-panel-${tab}`} aria-selected={active === tab} tabIndex={active === tab ? 0 : -1} onClick={() => select(tab)} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
        select(next ? "accounting" : "sales"); buttons.current[next]?.focus();
      }}>{label}</button>)}
    </div>
    {summary}
    <div role="tabpanel" id="sales-hub-panel-sales" aria-labelledby="sales-hub-tab-sales" hidden={active !== "sales"} tabIndex={0}>{sales}</div>
    <div role="tabpanel" id="sales-hub-panel-accounting" aria-labelledby="sales-hub-tab-accounting" hidden={active !== "accounting"} tabIndex={0}>{accounting}</div>
  </div>;
}
