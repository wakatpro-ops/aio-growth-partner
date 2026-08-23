"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export const APPLY_SOURCE_STORAGE_KEY = "aio-boost:apply-source-url";
export const APPLY_PREVIEW_STORAGE_KEY = "aio-boost:apply-preview";

export function ApplyForm() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");

  function startAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = sourceUrl.trim();
    if (!value) return;
    sessionStorage.setItem(APPLY_SOURCE_STORAGE_KEY, value);
    sessionStorage.removeItem(APPLY_PREVIEW_STORAGE_KEY);
    router.push("/apply/analyzing");
  }

  return (
    <form className="card form url-first-form" onSubmit={startAnalysis}>
      <div>
        <p className="eyebrow">最初の入力は1つだけ</p>
        <h2>お店のページURLを入力してください</h2>
        <p>公式ホームページがなくても、予約サイトや店舗ポータルの公開URLで始められます。</p>
      </div>
      <div className="field">
        <label htmlFor="source_url">店舗を確認できるURL</label>
        <input id="source_url" name="source_url" type="text" inputMode="url" autoComplete="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com または店舗ページのURL" />
        <p className="muted">公開情報だけを確認します。ここでは連絡先や店舗設定の入力はありません。</p>
      </div>
      <button className="button url-analysis-button" type="submit">URLから無料で簡易診断する</button>
    </form>
  );
}
