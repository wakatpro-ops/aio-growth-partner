"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { APPLY_EXCLUDED_STORAGE_KEY, APPLY_HINT_STORAGE_KEY, APPLY_PREVIEW_STORAGE_KEY } from "./apply-form";

type Source = { url: string; label: string; access?: string };
export function SourceSelection({ sources, excluded = [], storeName, area, disabled, onEditingChange }: {
  sources: Source[]; excluded?: string[]; storeName: string; area: string; disabled: boolean; onEditingChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(excluded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = selection.slice().sort().join("\n") !== excluded.slice().sort().join("\n");
  function toggle(url: string) {
    const next = selection.includes(url) ? selection.filter(value => value !== url) : [...selection, url];
    if (next.length > 12) { setError("一度に除外できる出典は12件までです。店舗の訂正から別のURLを指定してください。"); return; }
    setSelection(next); setError("");
    onEditingChange(next.slice().sort().join("\n") !== excluded.slice().sort().join("\n"));
  }
  return <div className="stack">
    <p className="muted">除外すると、再診断では同じサイトの情報も使いません。除外は後から解除できます。</p>
    <ul className="diagnosis-source-list">
      {sources.map(source => <li key={source.url} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, maxWidth: "100%" }}>
        <a href={source.url} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere", textDecoration: selection.includes(source.url) ? "line-through" : undefined }}>{source.label} ↗</a>
        <small>{source.access === "page" ? "ページ本文を取得" : "検索で参照"}</small>
        <button type="button" className="button secondary" disabled={disabled || busy} aria-label={`${source.label}を${selection.includes(source.url) ? "戻す" : "除外する"}`} onClick={() => toggle(source.url)}>{selection.includes(source.url) ? "元に戻す" : "× 除外"}</button>
      </li>)}
    </ul>
    {excluded.length ? <details><summary>除外済みの出典（{excluded.length}件）</summary><ul>{excluded.map(url => <li key={url} style={{ overflowWrap: "anywhere" }}>{url} <button className="button secondary" type="button" disabled={disabled || busy} onClick={() => toggle(url)}>{selection.includes(url) ? "除外を解除する" : "除外を維持する"}</button></li>)}</ul></details> : null}
    {error ? <p role="alert">{error}</p> : null}
    {changed ? <div className="notice"><p>出典を変更したため、今の診断では申し込めません。除外したページの情報を使わずに作り直します。元の保存済み店舗データは変更しません。</p><button className="button" type="button" disabled={disabled || busy} onClick={() => {
      if (busy) return;
      setBusy(true);
      sessionStorage.setItem(APPLY_EXCLUDED_STORAGE_KEY, JSON.stringify(selection));
      sessionStorage.setItem(APPLY_HINT_STORAGE_KEY, JSON.stringify({ store: storeName, area }));
      sessionStorage.removeItem(APPLY_PREVIEW_STORAGE_KEY);
      router.push("/apply/analyzing");
    }}>{busy ? "診断を作り直しています…" : "この出典で診断を作り直す"}</button></div> : null}
  </div>;
}
