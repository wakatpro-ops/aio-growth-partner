"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AiUsageMonthlySettings } from "@/lib/ai-usage/dashboard";
import styles from "./usage.module.css";

export function MonthlyUsageSettings({ month, settings, saveAction }: { month: string; settings: AiUsageMonthlySettings; saveAction: (form: FormData) => Promise<{ ok: boolean; message: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [rate, setRate] = useState(settings.usdJpy?.toString() ?? "");
  const [revenue, setRevenue] = useState(settings.serviceRevenueJpy?.toString() ?? "");
  function submit(form: FormData) {
    if (pending) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await saveAction(form);
        setFeedback({ error: !result.ok, text: result.message });
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ error: true, text: "更新できませんでした。権限・通信状態を確認し、もう一度お試しください。" });
      }
    });
  }
  return <section className={`card ${styles.settings}`} aria-labelledby="usage-settings-title">
    <div><p className={styles.eyebrow}>月ごとの計算条件</p><h2 id="usage-settings-title">円換算・利用料比率を設定</h2><p className={styles.note}>{month}だけに適用します。換算レートは自動取得せず、AIObの月額利用料売上は運営者が登録します。</p></div>
    <form action={submit}>
      <input type="hidden" name="month" value={month} />
      <fieldset disabled={pending} className={styles.settingsFields}>
        <label className="field">USD/JPY換算レート<span className={styles.note}>1 USDあたりの円</span><input name="usd_jpy" type="number" inputMode="decimal" min="0.000001" max="10000" step="any" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="未設定" /></label>
        <label className="field">AIOb利用料売上（税抜・円）<span className={styles.note}>全契約の月額利用料合計。店舗自身の売上ではありません。</span><input name="service_revenue_jpy" type="number" inputMode="decimal" min="0" step="any" value={revenue} onChange={(event) => setRevenue(event.target.value)} placeholder="未設定" /></label>
        <div className={styles.settingsSubmit}><button className="button" type="submit" disabled={pending} aria-busy={pending}>{pending ? "計算条件を更新中…" : "この月の計算条件を更新"}</button><span className={styles.note}>空欄で更新すると、その項目は未設定に戻ります。</span></div>
      </fieldset>
      {feedback ? <p role={feedback.error ? "alert" : "status"} className={`notice ${feedback.error ? "danger" : "success"}`}>{feedback.text}</p> : null}
    </form>
  </section>;
}
