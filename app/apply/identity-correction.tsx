"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APPLY_HINT_STORAGE_KEY, APPLY_PREVIEW_STORAGE_KEY, APPLY_SOURCE_STORAGE_KEY } from "./apply-form";

export function IdentityCorrection({ onEditingChange }: { onEditingChange?: (editing: boolean) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  return <section className="card stack" aria-label="店舗の訂正">
    {!editing ? <button className="button secondary" type="button" onClick={() => {
      setSource(sessionStorage.getItem(APPLY_SOURCE_STORAGE_KEY) ?? "");
      setEditing(true);
      onEditingChange?.(true);
    }}>違います・店舗を訂正する</button> : <form className="form" onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      const data = new FormData(event.currentTarget);
      const store = String(data.get("store_hint") ?? "").trim();
      const area = String(data.get("area_hint") ?? "").trim();
      if (!store || area.length < 2 || !source.trim()) return;
      setBusy(true);
      sessionStorage.setItem(APPLY_SOURCE_STORAGE_KEY, source.trim());
      sessionStorage.setItem(APPLY_HINT_STORAGE_KEY, JSON.stringify({ store, area }));
      sessionStorage.removeItem(APPLY_PREVIEW_STORAGE_KEY);
      router.push("/apply/analyzing");
    }}>
      <h2>正しいお店を教えてください</h2>
      <p>違う店舗の情報は引き継がず、店舗名と地域から調べ直します。</p>
      <div className="field"><label htmlFor="correct_store">店舗名</label><input id="correct_store" name="store_hint" required maxLength={140} placeholder="例：Amour by mee" disabled={busy} /></div>
      <div className="field"><label htmlFor="correct_area">地域（市区町村・町名）</label><input id="correct_area" name="area_hint" required minLength={2} maxLength={140} placeholder="例：巣鴨、港区六本木" disabled={busy} /></div>
      <div className="field"><label htmlFor="correct_url">店舗のURL（同じURLでも再調査できます）</label><input id="correct_url" value={source} onChange={(event) => setSource(event.target.value)} required maxLength={2000} disabled={busy} /></div>
      <div className="form-actions"><button className="button" disabled={busy} type="submit">{busy ? "再調査を始めています…" : "この内容で調べ直す"}</button><button className="button secondary" disabled={busy} type="button" onClick={() => { setEditing(false); onEditingChange?.(false); }}>訂正をやめる</button></div>
    </form>}
  </section>;
}
