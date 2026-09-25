"use client";

import Link from "next/link";
import { useState } from "react";

/** Illustrative markup only. Never insert samples into business data or AI context. */
export function DataPreview({ title, description, importHref, manualHref, kind = "chart" }: {
  title: string; description: string; importHref?: string; manualHref?: string; kind?: "chart" | "calendar" | "cards";
}) {
  const [deferred, setDeferred] = useState(false);
  if (deferred) return <div className="data-preview-later"><span>データはまだ登録されていません。</span><button type="button" className="button secondary" onClick={() => setDeferred(false)}>表示イメージを見る</button></div>;
  return <section className="data-preview" aria-label={`${title}の表示イメージ`} data-testid="data-preview">
    <div className={`data-preview-art ${kind}`} aria-hidden="true">
      {Array.from({ length: kind === "calendar" ? 14 : 8 }, (_, i) => <span key={i} style={{ "--sample-height": `${30 + (i * 17 % 60)}%` } as React.CSSProperties}>{kind === "calendar" ? <><small>{["月", "火", "水", "木", "金", "土", "日"][i % 7]}</small><i>予定</i></> : kind === "cards" ? <><i>●</i><small>お客様・商品</small></> : null}</span>)}
      {kind === "chart" ? <svg viewBox="0 0 600 200" preserveAspectRatio="none"><path d="M0 175 L80 150 L160 160 L240 95 L320 120 L400 60 L500 80 L600 20" fill="none" stroke="#26866e" strokeWidth="5" /></svg> : null}
    </div>
    <div className="data-preview-cloud">
      <span className="badge">表示イメージ・サンプルデータ</span>
      <h2>{title}</h2><p>{description}</p>
      <p className="muted">背景は完成イメージです。実際のお店の記録ではありません。</p>
      <div className="button-row">
        {importHref ? <Link href={importHref} className="button">データを取り込む</Link> : null}
        {manualHref ? <Link href={manualHref} className="button secondary">手入力で始める</Link> : null}
        <button type="button" className="button secondary" onClick={() => setDeferred(true)}>後で設定</button>
      </div>
    </div>
  </section>;
}
