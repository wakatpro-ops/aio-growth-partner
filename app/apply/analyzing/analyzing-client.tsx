"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APPLY_HINT_STORAGE_KEY, APPLY_PREVIEW_STORAGE_KEY, APPLY_SOURCE_STORAGE_KEY } from "../apply-form";

const progressSteps = [
  "公開ページを確認しています",
  "店舗情報を整理しています",
  "他の公開情報と照合しています",
  "診断結果を作成しています"
];

export function AnalyzingClient() {
  const router = useRouter();
  const started = useRef(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [storeHint, setStoreHint] = useState("");
  const [areaHint, setAreaHint] = useState("");
  const [needsHints, setNeedsHints] = useState(false);
  const [busy, setBusy] = useState(true);
  const inFlight = useRef(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function runAnalysis() {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      let hints = { store: "", area: "" };
      try { hints = JSON.parse(sessionStorage.getItem(APPLY_HINT_STORAGE_KEY) ?? "{}"); } catch { /* Invalid session hints are ignored. */ }
      const name = typeof hints.store === "string" ? hints.store : "";
      const area = typeof hints.area === "string" ? hints.area : "";
      setStoreHint(name);
      setAreaHint(area);
      const sourceUrl = sessionStorage.getItem(APPLY_SOURCE_STORAGE_KEY);
      if (!sourceUrl) {
        router.replace("/apply");
        return;
      }
      setError("");
      setErrorCode("");
      setNeedsHints(false);
      setStep(0);
      const startedAt = Date.now();
      const interval = window.setInterval(() => setStep((current) => Math.min(current + 1, progressSteps.length - 1)), 900);
      try {
        const response = await fetch("/api/public/store-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_url: sourceUrl, store_hint: name, area_hint: area })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          setError(data?.error ?? "ページを十分に解析できませんでした。別のURLをお試しください。");
          setErrorCode(data?.code ?? "analysis_failed");
          setNeedsHints(Boolean(data?.needs_store_hint || data?.code === "store_not_identified"));
          return;
        }
        const remainingEffectTime = Math.max(0, 1_800 - (Date.now() - startedAt));
        if (remainingEffectTime) await new Promise((resolve) => window.setTimeout(resolve, remainingEffectTime));
        setStep(progressSteps.length - 1);
        sessionStorage.setItem(APPLY_PREVIEW_STORAGE_KEY, JSON.stringify(data));
        router.replace("/apply/diagnosis");
      } catch {
        setError("通信が途切れました。別のURLを試すか、もう一度解析してください。");
      } finally {
        window.clearInterval(interval);
        inFlight.current = false;
        setBusy(false);
      }
    }
    void runAnalysis();
  }, [router, retryCount]);

  function retry() {
    if (inFlight.current) return;
    sessionStorage.setItem(APPLY_HINT_STORAGE_KEY, JSON.stringify({ store: storeHint.trim(), area: areaHint.trim() }));
    sessionStorage.removeItem(APPLY_PREVIEW_STORAGE_KEY);
    started.current = false;
    setRetryCount((current) => current + 1);
  }

  return (
    <div className="stack apply-analysis-screen">
      <section className="card submit-progress" aria-live="polite">
        {busy ? <div className="loading-mark" aria-hidden="true" /> : null}
        <div className="stack">
          <div><p className="eyebrow">{busy ? "AI解析中" : "追加確認"}</p><h1>{busy ? "お店の公開情報を整理しています" : "お店を特定するために確認させてください"}</h1><p>{busy ? "画面を閉じずに、そのままお待ちください。" : "まだ申し込みは送信されていません。"}</p></div>
          {busy ? <ol className="analysis-progress-list">
            {progressSteps.map((label, index) => <li className={index < step ? "is-complete" : index === step ? "is-current" : ""} key={label}><span aria-hidden="true">{index < step ? "✓" : index + 1}</span><strong>{label}</strong></li>)}
          </ol> : null}
        </div>
      </section>
      {error ? <section className="notice danger identification-recovery" role="alert"><strong>{errorCode === "store_not_identified" ? "別のお店と取り違えないよう、診断結果を保留しました" : "このURLでは診断結果を準備できませんでした"}</strong><p>{error}</p>
        <form className="form" onSubmit={(event) => { event.preventDefault(); retry(); }}>
          {needsHints ? <>
            <div className="field"><label htmlFor="store_hint">正しい店舗名</label><input id="store_hint" value={storeHint} onChange={(event) => setStoreHint(event.target.value)} placeholder="例：Natural kitchen yoomi" maxLength={140} required disabled={busy} /></div>
            <div className="field"><label htmlFor="area_hint">地域（市区町村・町名）</label><input id="area_hint" value={areaHint} onChange={(event) => setAreaHint(event.target.value)} placeholder="例：港区六本木、巣鴨" minLength={2} maxLength={140} required disabled={busy} /></div>
          </> : null}
          <div className="form-actions"><button className="button" type="submit" disabled={busy || (needsHints && (!storeHint.trim() || areaHint.trim().length < 2))}>{needsHints ? "店舗名と地域で調べ直す" : "もう一度解析する"}</button><Link className="button secondary" href="/apply">別のURLを入力</Link></div>
        </form>
      </section> : null}
    </div>
  );
}
