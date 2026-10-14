"use client";

import { useEffect, useRef, useState } from "react";

export function ProviderConnectButton({ href, children }: { href: string; children: string }) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reset = () => { locked.current = false; setBusy(false); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return <button type="button" className="button" disabled={busy} aria-busy={busy} onClick={() => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    window.location.assign(href);
  }}>{busy ? "接続画面を開いています…" : children}</button>;
}
