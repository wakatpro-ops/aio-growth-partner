"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APPLY_PREVIEW_STORAGE_KEY, APPLY_SOURCE_STORAGE_KEY } from "../apply-form";

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
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function runAnalysis() {
      const sourceUrl = sessionStorage.getItem(APPLY_SOURCE_STORAGE_KEY);
      if (!sourceUrl) {
        router.replace("/apply");
        return;
      }
      setError("");
      setErrorCode("");
      setStep(0);
      const startedAt = Date.now();
      const interval = window.setInterval(() => setStep((current) => Math.min(current + 1, progressSteps.length - 1)), 900);
      try {
        const response = await fetch("/api/public/store-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_url: sourceUrl, store_hint: storeHint })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          setError(data?.error ?? "ページを十分に解析できませんでした。別のURLをお試しください。");
          setErrorCode(data?.code ?? "analysis_failed");
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
      }
    }
    void runAnalysis();
  }, [router, retryCount, storeHint]);

  function retry() {
    started.current = false;
    setRetryCount((current) => current + 1);
  }

  return (
    <div className="stack apply-analysis-screen">
      <section className="card submit-progress" aria-live="polite">
        <div className="loading-mark" aria-hidden="true" />
        <div className="stack">
          <div><p className="eyebrow">AI解析中</p><h1>お店の公開情報を整理しています</h1><p>画面を閉じずに、そのままお待ちください。</p></div>
          <ol className="analysis-progress-list">
            {progressSteps.map((label, index) => <li className={index < step ? "is-complete" : index === step ? "is-current" : ""} key={label}><span aria-hidden="true">{index < step ? "✓" : index + 1}</span><strong>{label}</strong></li>)}
          </ol>
        </div>
      </section>
      {error ? <section className="notice danger identification-recovery" role="alert"><strong>{errorCode === "store_not_identified" ? "店舗を特定できなかったため、診断結果は表示していません" : "このURLでは診断結果を準備できませんでした"}</strong><p>{error}</p>{errorCode === "store_not_identified" ? <div className="field"><label htmlFor="store_hint">店舗名を追加して再解析</label><input id="store_hint" value={storeHint} onChange={(event) => setStoreHint(event.target.value)} placeholder="例：焼肉レストラン徳寿 本店" maxLength={140} /></div> : null}<div className="form-actions"><button className="button" type="button" onClick={retry} disabled={errorCode === "store_not_identified" && !storeHint.trim()}>{errorCode === "store_not_identified" ? "店舗名を使って再解析" : "同じURLでもう一度解析"}</button><Link className="button secondary" href="/apply">別のURLを入力</Link></div></section> : null}
    </div>
  );
}
