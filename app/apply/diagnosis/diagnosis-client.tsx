"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { APPLY_PREVIEW_STORAGE_KEY, APPLY_SOURCE_STORAGE_KEY } from "../apply-form";

type PreviewPayload = {
  analysis_token: string;
  status: "success" | "partial";
  profile: { store_name: string; industry_label: string; address: string };
  diagnosis: {
    business_summary: string;
    identification: { confidence: "high" | "medium" | "low"; label: string; reason: string };
    research_status: "cross_checked" | "input_only";
    checked_sources: Array<{ url: string; label: string; kind: string }>;
    expected_outcomes: Array<{ title: string; description: string }>;
  };
};

type ApplicationDraft = {
  contactName: string;
  email: string;
  phone: string;
};

type Stage = "loading" | "form" | "sending_code" | "code" | "verifying" | "submitting" | "submission_error" | "success";

export function DiagnosisClient() {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem(APPLY_PREVIEW_STORAGE_KEY);
    if (!stored) {
      setStage("form");
      return;
    }
    try {
      const parsed = JSON.parse(stored) as PreviewPayload;
      if (!parsed.analysis_token || !parsed.profile || !parsed.diagnosis?.identification || !Array.isArray(parsed.diagnosis.expected_outcomes) || !Array.isArray(parsed.diagnosis.checked_sources)) throw new Error("invalid preview");
      setPreview(parsed);
      setStage("form");
    } catch {
      sessionStorage.removeItem(APPLY_PREVIEW_STORAGE_KEY);
      setStage("form");
    }
  }, []);

  async function requestVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || stage === "sending_code") return;
    const formData = new FormData(event.currentTarget);
    const nextDraft = {
      contactName: String(formData.get("contact_name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim()
    };
    setDraft(nextDraft);
    setError("");
    setErrorCode("");
    setStage("sending_code");
    try {
      const response = await fetch("/api/public/store-analysis/verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_token: preview.analysis_token, contact_name: nextDraft.contactName, email: nextDraft.email })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "確認メールを送信できませんでした。");
        setErrorCode(data?.code ?? "");
        setStage("form");
        return;
      }
      setStage("code");
    } catch {
      setError("確認メールの送信中に通信が途切れました。もう一度お試しください。");
      setStage("form");
    }
  }

  async function submitVerifiedApplication(currentDraft: ApplicationDraft) {
    if (!preview) return;
    setStage("submitting");
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_token: preview.analysis_token,
          contact_name: currentDraft.contactName,
          email: currentDraft.email,
          phone: currentDraft.phone,
          store_confirmed: true,
          authority_confirmed: true
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "申し込みを保存できませんでした。もう一度お試しください。");
        setErrorCode(data?.code ?? "");
        setStage("submission_error");
        return;
      }
      sessionStorage.removeItem(APPLY_SOURCE_STORAGE_KEY);
      sessionStorage.removeItem(APPLY_PREVIEW_STORAGE_KEY);
      setStage("success");
    } catch {
      setError("申込の送信中に通信が途切れました。もう一度お試しください。");
      setStage("submission_error");
    }
  }

  async function confirmVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !draft || stage === "verifying") return;
    const formData = new FormData(event.currentTarget);
    setError("");
    setErrorCode("");
    setStage("verifying");
    try {
      const response = await fetch("/api/public/store-analysis/verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis_token: preview.analysis_token, email: draft.email, code: String(formData.get("code") ?? "") })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "確認コードを確認できませんでした。");
        setErrorCode(data?.code ?? "");
        setStage("code");
        return;
      }
      await submitVerifiedApplication(draft);
    } catch {
      setError("メール確認中に通信が途切れました。もう一度お試しください。");
      setStage("code");
    }
  }

  if (stage === "loading") return <section className="card"><p>診断結果を準備しています...</p></section>;
  if (!preview) return <section className="card stack"><h1>診断結果を表示できません</h1><p>診断結果が見つかりません。URLからもう一度診断してください。</p><Link className="button" href="/apply">URLを入力する</Link></section>;
  if (stage === "success") {
    return <section className="card success-card" aria-live="polite"><p className="eyebrow">申込受付完了</p><h1>株式会社 Navi Lifeが申込内容を確認します</h1><p>メールアドレスの確認と正式申込が完了しました。通常2営業日以内を目安に、同じメールアドレスへ審査結果をご案内します。</p><ol className="compact-list"><li>承認された場合は、パスワード設定用の専用リンクをお送りします。</li><li>追加確認が必要な場合も、同じメールアドレスへご連絡します。</li><li>この時点では契約成立、請求、外部投稿は行われません。</li></ol></section>;
  }

  return (
    <div className="stack url-first-intake">
      <div><p className="eyebrow">無料の簡易診断</p><h1>診断結果ができました</h1></div>
      <section className="card analysis-hero">
        <div><p className="step-label">この店舗で合っていますか？</p><h2>{preview.profile.store_name}</h2>{preview.profile.address ? <p><strong>{preview.profile.address}</strong></p> : null}<p>{preview.diagnosis.business_summary}</p><p className="muted">公開情報を基に店舗を確認しました。検索順位やAIからの推薦を保証する診断ではありません。</p></div>
        <div className={`store-identification ${preview.diagnosis.identification.confidence}`}><span aria-hidden="true">✓</span><strong>{preview.diagnosis.identification.label}</strong><small>{preview.diagnosis.identification.reason}</small></div>
      </section>
      <section className="card diagnosis-sources-card">
        <div><p className="step-label">確認した公開情報</p><h2>{preview.diagnosis.research_status === "cross_checked" ? `${preview.diagnosis.checked_sources.length}件の情報源を照合しました` : "入力された店舗ページを確認しました"}</h2><p>{preview.diagnosis.research_status === "cross_checked" ? "店舗名・住所・提供内容などが一致する公開ページだけを表示しています。" : "他の公開情報を十分に照合できなかったため、詳細診断で追加確認します。"}</p></div>
        <ul className="diagnosis-source-list">
          {preview.diagnosis.checked_sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<span aria-hidden="true">↗</span></a></li>)}
        </ul>
      </section>
      <section className="card expected-outcomes-card">
        <div><p className="step-label">AIO boostを導入すると</p><h2>この店舗には、こんな改善が期待できます</h2><p>公開情報から考えられる活用例です。効果を保証するものではなく、承認後の詳細診断で店舗に合わせて具体化します。</p></div>
        <ol className="expected-outcomes-list">
          {preview.diagnosis.expected_outcomes.map((outcome, index) => <li key={`${outcome.title}-${index}`}><span aria-hidden="true">{index + 1}</span><div><h3>{outcome.title}</h3><p>{outcome.description}</p></div></li>)}
        </ol>
      </section>

      {(stage === "form" || stage === "sending_code") ? (
        <form className="card form" onSubmit={requestVerification}>
          <div><p className="eyebrow">詳細診断を申し込む</p><h2>連絡先を確認します</h2><p>運営方法やシステム設定は、承認後にAIの下書きを確認するだけです。</p></div>
          <label className="consent-row store-match-confirmation"><input name="store_confirmed" type="checkbox" required /><span><strong>上に表示された店舗で合っています</strong><span className="required-mark"> 必須</span></span></label>
          <div className="grid cols-2">
            <div className="field"><label htmlFor="email">メールアドレス</label><input id="email" name="email" type="email" autoComplete="email" defaultValue={draft?.email} required /></div>
            <div className="field"><label htmlFor="contact_name">お名前</label><input id="contact_name" name="contact_name" autoComplete="name" defaultValue={draft?.contactName} required /></div>
            <div className="field"><label htmlFor="phone">連絡先電話番号</label><input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={draft?.phone} required placeholder="例: 090-1234-5678" /></div>
          </div>
          <label className="consent-row"><input name="authority_confirmed" type="checkbox" required /><span>私はこの店舗について詳細診断を申し込む正当な権限があります。 <span className="required-mark">必須</span></span></label>
          <p className="muted">確認メールは連絡先の到達確認です。株式会社 Navi Lifeが申込内容を別途審査します。</p>
          <PendingSubmitButton busy={stage === "sending_code"} pendingLabel="確認メールを送信しています...">確認メールを受け取る</PendingSubmitButton>
        </form>
      ) : null}

      {(stage === "code" || stage === "verifying" || stage === "submitting") && draft ? (
        <form className="card form" onSubmit={confirmVerification}>
          <div><p className="eyebrow">メール確認</p><h2>メールに届いた6桁のコードを入力</h2><p><strong>{draft.email}</strong> へ確認コードを送りました。確認できると、そのまま正式申込が完了します。</p></div>
          <div className="field"><label htmlFor="verification_code">確認コード</label><input id="verification_code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required placeholder="123456" disabled={stage === "submitting"} /></div>
          <div className="form-actions"><button className="button secondary" type="button" onClick={() => setStage("form")} disabled={stage === "verifying" || stage === "submitting"}>入力内容を変更</button><PendingSubmitButton busy={stage === "verifying" || stage === "submitting"} pendingLabel={stage === "submitting" ? "正式申込を送信しています..." : "メールを確認しています..."}>メールを確認して申し込む</PendingSubmitButton></div>
        </form>
      ) : null}

      {stage === "submission_error" && draft ? <section className="notice danger" role="alert"><strong>{errorCode === "applicant_email_registered" ? "このメールアドレスは登録済みです" : "メール確認は完了しましたが、申込を保存できませんでした"}</strong><p>{error}</p>{errorCode === "applicant_email_registered" ? <div className="form-actions"><Link className="button secondary" href="/login">ログインする</Link><Link className="button secondary" href="/auth/forgot-password">パスワードを再設定</Link></div> : <button className="button" type="button" onClick={() => void submitVerifiedApplication(draft)}>正式申込をもう一度送る</button>}</section> : null}
      {error && stage !== "submission_error" ? <section className="notice danger" role="alert"><strong>確認してください</strong><p>{error}</p>{errorCode === "applicant_email_registered" ? <div className="form-actions"><Link className="button secondary" href="/login">ログインする</Link><Link className="button secondary" href="/auth/forgot-password">パスワードを再設定</Link></div> : null}</section> : null}
      <Link className="back-link" href="/apply">← 別のURLで診断する</Link>
    </div>
  );
}
