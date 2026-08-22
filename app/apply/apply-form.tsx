"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type PreviewPayload = {
  analysis_token: string;
  status: "success" | "partial";
  profile: { store_name: string; industry_label: string };
  diagnosis: {
    business_summary: string;
    readiness_score: number;
    top_improvement: { key: string; title: string; description: string };
  };
};

type Stage = "idle" | "analyzing" | "preview" | "sending_code" | "code" | "verifying" | "verified" | "submitting" | "success";

export function ApplyForm() {
  const [stage, setStage] = useState<Stage>("idle");
  const [sourceUrl, setSourceUrl] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === "analyzing") return;
    setError("");
    setPreview(null);
    setStage("analyzing");
    try {
      const response = await fetch("/api/public/store-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "ページを確認できませんでした。URLを確認してもう一度お試しください。");
        setStage("idle");
        return;
      }
      setPreview(data as PreviewPayload);
      setStage("preview");
      requestAnimationFrame(() => document.getElementById("store-analysis-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setError("通信が途切れました。時間をおいて、もう一度お試しください。");
      setStage("idle");
    }
  }

  async function requestVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || stage === "sending_code") return;
    const formData = new FormData(event.currentTarget);
    const nextName = String(formData.get("contact_name") ?? "").trim();
    const nextEmail = String(formData.get("email") ?? "").trim();
    setContactName(nextName);
    setEmail(nextEmail);
    setError("");
    setStage("sending_code");
    try {
      const response = await fetch("/api/public/store-analysis/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_token: preview.analysis_token, contact_name: nextName, email: nextEmail })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "確認メールを送信できませんでした。");
        setStage("preview");
        return;
      }
      setStage("code");
    } catch {
      setError("確認メールの送信中に通信が途切れました。もう一度お試しください。");
      setStage("preview");
    }
  }

  async function confirmVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || stage === "verifying") return;
    const formData = new FormData(event.currentTarget);
    setError("");
    setStage("verifying");
    try {
      const response = await fetch("/api/public/store-analysis/verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_token: preview.analysis_token, email, code: String(formData.get("code") ?? "") })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "確認コードを確認できませんでした。");
        setStage("code");
        return;
      }
      setStage("verified");
    } catch {
      setError("確認中に通信が途切れました。もう一度お試しください。");
      setStage("code");
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || stage === "submitting") return;
    const formData = new FormData(event.currentTarget);
    setError("");
    setStage("submitting");
    const payload = {
      analysis_token: preview.analysis_token,
      contact_name: contactName,
      email,
      phone: String(formData.get("phone") ?? ""),
      company_name: String(formData.get("company_name") ?? ""),
      store_relationship: String(formData.get("store_relationship") ?? ""),
      authority_confirmed: formData.get("authority_confirmed") === "on",
      message: String(formData.get("message") ?? "")
    };
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "申し込みを保存できませんでした。入力内容を確認してください。");
        setStage("verified");
        return;
      }
      setStage("success");
      requestAnimationFrame(() => document.getElementById("application-complete")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch {
      setError("送信中に通信が途切れました。入力内容はそのままです。もう一度お試しください。");
      setStage("verified");
    }
  }

  const completed = stage === "success";
  return (
    <div className="stack url-first-intake">
      <form className="card form url-first-form" onSubmit={analyze}>
        <div><p className="eyebrow">最初の入力は1つだけ</p><h2>お店のページURLを入力してください</h2><p>公式ホームページがなくても、予約サイトや店舗ポータルの公開URLで始められます。</p></div>
        <div className="field">
          <label htmlFor="source_url">店舗を確認できるURL <span className="required-mark">必須</span></label>
          <input id="source_url" name="source_url" type="text" inputMode="url" autoComplete="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com または店舗ページのURL" disabled={stage !== "idle"} />
          <p className="muted">公開情報だけを確認します。簡易診断後、詳細診断を希望する場合だけ申込へ進みます。</p>
        </div>
        <button className="button url-analysis-button" type="submit" disabled={stage !== "idle"}>{stage === "analyzing" ? "お店の情報を確認しています..." : "URLから無料で簡易診断する"}</button>
      </form>

      {stage === "analyzing" ? <section className="card submit-progress" aria-live="polite"><div className="loading-mark" aria-hidden="true" /><div><strong>AIがお店の公開情報を整理しています</strong><ol className="compact-list"><li>店舗ページを安全に確認しています。</li><li>業態・地域・サービスを整理しています。</li><li>おすすめされる準備状況を診断しています。</li></ol></div></section> : null}
      {error ? <section className="notice danger" role="alert"><strong>確認してください</strong><p>{error}</p></section> : null}

      {preview && !completed ? (
        <section className="stack" id="store-analysis-preview">
          <section className="card analysis-hero">
            <div><p className="eyebrow">無料の簡易診断</p><h2>{preview.profile.store_name || "店舗名を確認できませんでした"}</h2><p>{preview.diagnosis.business_summary}</p><p className="muted">公開情報を基にした参考診断です。検索順位や推薦を保証しません。</p></div>
            <div className="readiness-score"><span>AIおすすめ準備度</span><strong>{preview.diagnosis.readiness_score}%</strong><small>詳細な根拠は申込確認後にご案内します</small></div>
          </section>
          <section className="card first-priority-card"><p className="step-label">最初に改善すると良いこと</p><h2>{preview.diagnosis.top_improvement.title}</h2><p>{preview.diagnosis.top_improvement.description}</p></section>

          {stage === "preview" || stage === "sending_code" ? (
            <form className="card form" onSubmit={requestVerification}>
              <div><p className="eyebrow">詳細診断を申し込む</p><h2>まずメールアドレスを確認します</h2><p>名前とメールだけを入力してください。電話番号はメール確認後の正式申込で伺います。</p></div>
              <div className="grid cols-2">
                <div className="field"><label htmlFor="contact_name">担当者名 <span className="required-mark">必須</span></label><input id="contact_name" name="contact_name" autoComplete="name" defaultValue={contactName} required /></div>
                <div className="field"><label htmlFor="email">メールアドレス <span className="required-mark">必須</span></label><input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required /></div>
              </div>
              <p className="muted">メール確認は連絡先の到達確認であり、店舗所有権の証明ではありません。</p>
              <button className="button" type="submit" disabled={stage === "sending_code"}>{stage === "sending_code" ? "確認コードを送信しています..." : "確認コードをメールで受け取る"}</button>
            </form>
          ) : null}

          {stage === "code" || stage === "verifying" ? (
            <form className="card form" onSubmit={confirmVerification}>
              <div><p className="eyebrow">メール確認</p><h2>メールに届いた6桁のコードを入力</h2><p><strong>{email}</strong> へ確認コードを送信しました。コードは10分間有効です。</p></div>
              <div className="field"><label htmlFor="verification_code">確認コード <span className="required-mark">必須</span></label><input id="verification_code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required placeholder="123456" /></div>
              <div className="form-actions"><button className="button secondary" type="button" onClick={() => setStage("preview")} disabled={stage === "verifying"}>メールを変更</button><button className="button" type="submit" disabled={stage === "verifying"}>{stage === "verifying" ? "確認しています..." : "メールを確認して正式申込へ"}</button></div>
            </form>
          ) : null}

          {stage === "verified" || stage === "submitting" ? (
            <form className="card form" onSubmit={submitApplication}>
              <div><p className="eyebrow">正式申込</p><h2>店舗との関係を確認させてください</h2><p>株式会社 Navi Lifeが内容を確認し、承認後に詳細診断の専用リンクをメールでお送りします。</p></div>
              <div className="notice success"><strong>メール確認済み</strong><p>{contactName} / {email}</p></div>
              <div className="grid cols-2">
                <div className="field"><label htmlFor="phone">連絡先電話番号 <span className="required-mark">必須</span></label><input id="phone" name="phone" type="tel" autoComplete="tel" required placeholder="例: 090-1234-5678" /><p className="muted">公開ページの店舗電話は自動入力していません。</p></div>
                <div className="field"><label htmlFor="company_name">会社名</label><input id="company_name" name="company_name" autoComplete="organization" placeholder="法人の場合に入力してください" /></div>
                <div className="field"><label htmlFor="store_relationship">対象店舗との関係 <span className="required-mark">必須</span></label><select id="store_relationship" name="store_relationship" required defaultValue=""><option value="" disabled>選択してください</option><option value="owner">店舗オーナー</option><option value="employee">店舗スタッフ・従業員</option><option value="operator">店舗運営会社</option><option value="authorized_agent">正規代理人</option><option value="other">その他</option></select></div>
              </div>
              <div className="field"><label htmlFor="application_message">補足・確認事項</label><textarea id="application_message" name="message" placeholder="代理申込の場合の関係や、確認してほしい内容をご記入ください" /></div>
              <label className="consent-row"><input name="authority_confirmed" type="checkbox" required /><span>私は対象店舗のオーナー、従業員、運営会社または正規に許可された代理人であり、この店舗について詳細診断を申し込む正当な権限があります。 <span className="required-mark">必須</span></span></label>
              <p className="muted">競合店舗の大量調査、継続監視、嫌がらせ目的の利用は禁止しています。必要に応じて店舗との関係を追加確認します。</p>
              <button className="button" type="submit" disabled={stage === "submitting"}>{stage === "submitting" ? "正式申込を送信しています..." : "確認内容に同意して正式申込を送る"}</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {completed ? <section className="card success-card" id="application-complete" aria-live="polite"><p className="eyebrow">申込受付完了</p><h2>株式会社 Navi Lifeが申込内容を確認します</h2><p>メール確認済みの連絡先と店舗との関係を受け付けました。通常2営業日以内を目安に、確認結果をメールでご案内します。</p><ol className="compact-list"><li>承認後、詳細診断を確認できる専用リンクをお送りします。</li><li>追加確認が必要な場合は、同じメールアドレスへご連絡します。</li><li>この時点で契約成立、請求、外部投稿、アカウント発行は行われません。</li></ol></section> : null}
    </div>
  );
}
