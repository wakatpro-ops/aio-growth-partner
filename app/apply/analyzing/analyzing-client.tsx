"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APPLY_PREVIEW_STORAGE_KEY, APPLY_SOURCE_STORAGE_KEY } from "../apply-form";

const progressSteps = [
  "公開ページを確認しています",
  "店舗情報を整理しています",
  "AIにおすすめされる準備状況を診断しています",
  "診断結果を作成しています"
];

export function AnalyzingClient() {
  const router = useRouter();
  const started = useRef(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
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
      setStep(0);
      const startedAt = Date.now();
      const interval = window.setInterval(() => setStep((current) => Math.min(current + 1, progressSteps.length - 1)), 900);
      try {
        const response = await fetch("/api/public/store-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_url: sourceUrl })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          setError(data?.error ?? "ページを十分に解析できませんでした。別のURLをお試しください。");
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
  }, [router, retryCount]);

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
      {error ? <section className="notice danger" role="alert"><strong>このURLでは診断結果を準備できませんでした</strong><p>{error}</p><div className="form-actions"><button className="button" type="button" onClick={retry}>同じURLでもう一度解析</button><Link className="button secondary" href="/apply">別のURLを入力</Link></div></section> : null}
    </div>
  );
}
