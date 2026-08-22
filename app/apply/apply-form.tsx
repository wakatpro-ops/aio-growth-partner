"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { publicIndustryOptions } from "@/lib/applications/options";

type FieldOrigin = "published" | "inferred" | "missing";
type AnalysisPayload = {
  analysis_token: string;
  status: "success" | "partial";
  source_url: string;
  final_url: string;
  ai_status: "success" | "fallback";
  profile: {
    store_name: string;
    company_name: string;
    industry_key: string;
    industry_label: string;
    address: string;
    phone: string;
    opening_hours: string;
    description: string;
    services: string[];
    strengths: string[];
    target_customers: string[];
    social_urls: string[];
    source_urls: string[];
    field_origins: Record<string, FieldOrigin>;
  };
  diagnosis: {
    business_summary: string;
    readiness_score: number;
    readiness_items: Array<{ key: string; label: string; earned: number; weight: number; status: string; detail: string }>;
    target_questions: string[];
    top_improvement: { key: string; title: string; description: string };
    clarifying_questions: Array<{ id: string; label: string; question: string; placeholder: string }>;
    recommended_modules: Array<{ key: string; label: string; reason: string }>;
  };
};

type PageState = "idle" | "analyzing" | "result" | "submitting" | "success";

function originLabel(origin: FieldOrigin | undefined) {
  if (origin === "published") return "公開ページで確認";
  if (origin === "inferred") return "AIの推定・要確認";
  return "未確認";
}

function valueOrPending(value: string | string[]) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "まだ確認できていません";
  return value || "まだ確認できていません";
}

export function ApplyForm() {
  const [state, setState] = useState<PageState>("idle");
  const [sourceUrl, setSourceUrl] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [showApplication, setShowApplication] = useState(false);
  const [error, setError] = useState("");
  const followUpQuestions = (analysis?.diagnosis.clarifying_questions ?? [])
    .filter((question) => !["store_name", "industry", "industry_key", "address", "phone", "services", "representative_service"].includes(question.id))
    .slice(0, 3);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "analyzing") return;
    setError("");
    setAnalysis(null);
    setShowApplication(false);
    setState("analyzing");
    try {
      const response = await fetch("/api/public/store-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "ページを確認できませんでした。URLを確認してもう一度お試しください。");
        setState("idle");
        return;
      }
      setAnalysis(data as AnalysisPayload);
      setState("result");
      requestAnimationFrame(() => document.getElementById("store-analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setError("通信が途切れました。時間をおいて、もう一度お試しください。");
      setState("idle");
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!analysis || state === "submitting") return;
    setError("");
    setState("submitting");
    const formData = new FormData(event.currentTarget);
    const answers = Object.fromEntries(
      followUpQuestions.map((question) => [question.id, String(formData.get(`answer_${question.id}`) ?? "")])
    );
    const payload = {
      analysis_token: analysis.analysis_token,
      store_name: String(formData.get("store_name") ?? ""),
      industry_detail_key: String(formData.get("industry_detail_key") ?? "other_service"),
      address: String(formData.get("address") ?? ""),
      representative_service: String(formData.get("representative_service") ?? ""),
      contact_name: String(formData.get("contact_name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      answers
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
        setState("result");
        return;
      }
      setState("success");
      requestAnimationFrame(() => document.getElementById("application-complete")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch {
      setError("送信中に通信が途切れました。入力内容はそのままです。もう一度お試しください。");
      setState("result");
    }
  }

  return (
    <div className="stack url-first-intake">
      <form className="card form url-first-form" onSubmit={analyze}>
        <div>
          <p className="eyebrow">最初の入力は1つだけ</p>
          <h2>お店のページURLを入力してください</h2>
          <p>公式ホームページがなくても、Hot Pepperなどの予約サイト、店舗ポータル、GoogleマップのURLで始められます。</p>
        </div>
        <div className="field">
          <label htmlFor="source_url">店舗を確認できるURL <span className="required-mark">必須</span></label>
          <input id="source_url" name="source_url" type="text" inputMode="url" autoComplete="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com または店舗ページのURL" disabled={state === "analyzing" || state === "submitting" || state === "success"} />
          <p className="muted">公開されている情報だけを確認します。読み取り結果は、申し込み前に確認・修正できます。</p>
          <p className="muted">URLを送信すると、公開情報を事前診断のために取得・解析します。詳しくは<a href="/privacy">プライバシーポリシー</a>をご確認ください。</p>
        </div>
        <button className="button url-analysis-button" type="submit" disabled={state === "analyzing" || state === "submitting" || state === "success"}>
          {state === "analyzing" ? "お店の情報を確認しています..." : "URLから無料で確認する"}
        </button>
      </form>

      {state === "analyzing" ? (
        <section className="card submit-progress" aria-live="polite">
          <div className="loading-mark" aria-hidden="true" />
          <div>
            <strong>AIがお店の公開情報を整理しています</strong>
            <ol className="compact-list"><li>店舗ページを安全に確認しています。</li><li>店舗名・地域・メニュー・特徴を整理しています。</li><li>おすすめされるための準備状況を診断しています。</li></ol>
            <p className="muted">通常は20秒ほどです。この画面を閉じずにお待ちください。</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="notice danger" role="alert"><strong>確認してください</strong><p>{error}</p>{!analysis ? <p>URLを修正するか、公式サイト以外の店舗ページを入力して再試行できます。</p> : null}</section>
      ) : null}

      {analysis && state !== "success" ? (
        <section className="stack analysis-result" id="store-analysis-result">
          {analysis.status === "partial" ? <p className="notice">公開ページから確認できた範囲で診断しました。確認できなかった項目は、下で修正・追加できます。</p> : null}
          {analysis.ai_status === "fallback" ? <p className="notice">AIによる追加整理は一時的に利用できないため、公開ページから機械的に確認できた内容を表示しています。</p> : null}

          <section className="card analysis-hero">
            <div><p className="eyebrow">AIの読み取り結果</p><h2>{analysis.profile.store_name || "店舗名を確認できませんでした"}</h2><p>{analysis.diagnosis.business_summary}</p><p className="muted">確定情報ではありません。内容を確認してから保存できます。</p></div>
            <div className="readiness-score" aria-label={`AIおすすめ準備度 ${analysis.diagnosis.readiness_score}パーセント`}><span>AIおすすめ準備度</span><strong>{analysis.diagnosis.readiness_score}%</strong><small>検索順位や推薦を保証する数値ではありません</small></div>
          </section>

          <section className="ai-question-panel">
            <p className="eyebrow">お客様がAIに尋ねそうな質問</p>
            <div className="grid cols-3">{analysis.diagnosis.target_questions.map((question, index) => <article className="static-card" key={question}><span>想定質問 {index + 1}</span><strong>「{question}」</strong></article>)}</div>
          </section>

          <section className="card first-priority-card"><p className="step-label">最初に改善すると良いこと</p><h2>{analysis.diagnosis.top_improvement.title}</h2><p>{analysis.diagnosis.top_improvement.description}</p></section>

          <section className="card">
            <div className="section-heading"><div><p className="eyebrow">診断の根拠</p><h2>どこまで準備できているか</h2></div></div>
            <div className="grid cols-3">{analysis.diagnosis.readiness_items.map((item) => <article className="static-card" key={item.key}><span>{item.status}</span><strong>{item.label} {item.earned}/{item.weight}</strong><p>{item.detail}</p></article>)}</div>
          </section>

          <section className="card">
            <p className="eyebrow">公開ページから確認した内容</p><h2>管理画面へ引き継げる店舗情報</h2>
            <div className="grid cols-2 extracted-profile-grid">
              {[
                ["store_name", "店舗名", analysis.profile.store_name], ["industry_key", "業態", analysis.profile.industry_label],
                ["address", "住所・地域", analysis.profile.address], ["phone", "電話番号", analysis.profile.phone],
                ["opening_hours", "営業時間", analysis.profile.opening_hours], ["services", "メニュー・サービス", analysis.profile.services],
                ["strengths", "特徴・強み", analysis.profile.strengths], ["target_customers", "おすすめしたいお客様", analysis.profile.target_customers]
              ].map(([key, label, value]) => <article className="static-card" key={String(key)}><span>{originLabel(analysis.profile.field_origins[String(key)])}</span><strong>{String(label)}</strong><p>{valueOrPending(value as string | string[])}</p></article>)}
            </div>
          </section>

          {!showApplication ? (
            <section className="card diagnosis-cta"><h2>この診断を、あなたのお店専用の管理画面へつなげます</h2><p>次に確認するのは連絡先と、AIが読み取れなかった重要項目だけです。入力済みの店舗情報をもう一度入力する必要はありません。</p><button className="button" type="button" onClick={() => setShowApplication(true)}>診断結果を保存して導入相談する</button></section>
          ) : (
            <form className="card form confirmation-form" onSubmit={submitApplication}>
              <div><p className="eyebrow">最後に確認</p><h2>読み取り結果の修正と連絡先</h2><p>AIの読み取り違いがあれば直してください。結果と回答を管理画面の初期設定下書きへ引き継ぎます。</p></div>
              <div className="grid cols-2">
                <div className="field"><label htmlFor="store_name">店舗名 <span className="required-mark">必須</span></label><input id="store_name" name="store_name" required defaultValue={analysis.profile.store_name} /></div>
                <div className="field"><label htmlFor="industry_detail_key">業態 <span className="required-mark">必須</span></label><select id="industry_detail_key" name="industry_detail_key" required defaultValue={analysis.profile.industry_key}>{publicIndustryOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></div>
                <div className="field"><label htmlFor="address">住所・地域</label><input id="address" name="address" defaultValue={analysis.profile.address} placeholder="例: 東京都杉並区梅里2丁目" /></div>
                <div className="field"><label htmlFor="representative_service">代表的なメニュー・サービス</label><input id="representative_service" name="representative_service" defaultValue={analysis.profile.services[0] ?? ""} placeholder="例: ハーブピーリング" /></div>
              </div>
              {followUpQuestions.length ? (
                <section className="stack"><div><h3>AIが確認できなかったこと</h3><p className="muted">分かる範囲で回答できます。すべて任意です。</p></div>{followUpQuestions.map((question) => <div className="field" key={question.id}><label htmlFor={`answer_${question.id}`}>{question.question}</label><textarea id={`answer_${question.id}`} name={`answer_${question.id}`} placeholder={question.placeholder} /></div>)}</section>
              ) : null}
              <section className="stack"><h3>ご案内先</h3><div className="grid cols-2">
                <div className="field"><label htmlFor="contact_name">担当者名 <span className="required-mark">必須</span></label><input id="contact_name" name="contact_name" autoComplete="name" required /></div>
                <div className="field"><label htmlFor="email">メール <span className="required-mark">必須</span></label><input id="email" name="email" type="email" autoComplete="email" required /></div>
                <div className="field"><label htmlFor="phone">電話番号</label><input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={analysis.profile.phone} /></div>
              </div></section>
              <p className="muted">送信後、担当者が内容を確認してご連絡します。外部サイトへの投稿や変更が自動で行われることはありません。</p>
              <div className="form-actions"><button className="button secondary" type="button" onClick={() => setShowApplication(false)} disabled={state === "submitting"}>診断結果へ戻る</button><button className="button" type="submit" disabled={state === "submitting"}>{state === "submitting" ? "申し込みを保存しています..." : "確認内容を保存して導入相談を送る"}</button></div>
            </form>
          )}
        </section>
      ) : null}

      {state === "success" ? (
        <section className="card success-card" id="application-complete" aria-live="polite"><p className="eyebrow">送信完了</p><h2>診断結果と導入相談を受け付けました</h2><p>AIの読み取り結果と確認内容は保存済みです。担当者が確認し、ご入力のメールアドレスへご案内します。</p><ol className="compact-list"><li>同じ店舗情報を最初から入力し直す必要はありません。</li><li>ご利用開始時は、想定質問と最優先のAIO改善から始められます。</li><li>外部への公開・投稿は、内容を確認してから行います。</li></ol></section>
      ) : null}
    </div>
  );
}
