"use client";

import { useMemo, useState } from "react";
import { currentToolOptions, improvementGoalOptions, publicIndustryOptions } from "@/lib/applications/options";

type AnalysisResult = {
  business_summary: string;
  growth_opportunities: string[];
  recommended_setup_steps: string[];
  first_meeting_points: string[];
  status: string;
};

type SubmitState =
  | { status: "idle"; message: string; applicationId?: never; analysis?: never }
  | { status: "loading"; message: string; applicationId?: never; analysis?: never }
  | { status: "success"; message: string; applicationId: string | null; analysis: AnalysisResult }
  | { status: "error"; message: string; applicationId?: never; analysis?: never };

function linesToList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ApplyForm() {
  const [state, setState] = useState<SubmitState>({ status: "idle", message: "" });
  const [selectedIndustry, setSelectedIndustry] = useState<string>(publicIndustryOptions[0].key);
  const selectedIndustryLabel = useMemo(
    () => publicIndustryOptions.find((option) => option.key === selectedIndustry)?.label ?? "店舗・サービス業",
    [selectedIndustry]
  );

  async function submit(formData: FormData) {
    setState({ status: "loading", message: "AIが店舗情報を整理しています。Webサイトや入力内容から、お店の特徴を読み取っています。" });

    const payload = {
      industry_detail_key: String(formData.get("industry_detail_key") ?? selectedIndustry),
      store_name: String(formData.get("store_name") ?? ""),
      contact_name: String(formData.get("contact_name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      store_count: String(formData.get("store_count") ?? "1"),
      website_url: String(formData.get("website_url") ?? ""),
      google_maps_url: String(formData.get("google_maps_url") ?? ""),
      instagram_url: String(formData.get("instagram_url") ?? ""),
      line_url: String(formData.get("line_url") ?? ""),
      other_social_urls: linesToList(formData.get("other_social_urls")),
      reference_urls: linesToList(formData.get("reference_urls")),
      current_tools: formData.getAll("current_tools").map(String),
      improvement_goals: formData.getAll("improvement_goals").map(String),
      pain_points: String(formData.get("pain_points") ?? ""),
      message: String(formData.get("message") ?? "")
    };

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      setState({ status: "error", message: data?.error ?? "送信に失敗しました。入力内容を確認してもう一度お試しください。" });
      return;
    }

    setState({
      status: "success",
      message: "導入相談を受け付けました。入力内容をもとに、AIOが初期整理を行いました。",
      applicationId: data.application_id ?? null,
      analysis: data.analysis
    });
  }

  return (
    <div className="stack">
      <form className="card form" action={submit}>
        <section className="stack">
          <div>
            <p className="muted">Step 1</p>
            <h2>お店の基本情報</h2>
            <p className="muted">まずは、導入したい店舗の概要を教えてください。</p>
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="store_name">店舗名</label>
              <input id="store_name" name="store_name" required placeholder="例: 佐藤オート整備" />
            </div>
            <div className="field">
              <label htmlFor="contact_name">担当者名</label>
              <input id="contact_name" name="contact_name" required placeholder="例: 佐藤 太郎" />
            </div>
            <div className="field">
              <label htmlFor="email">メール</label>
              <input id="email" name="email" type="email" required placeholder="example@example.com" />
            </div>
            <div className="field">
              <label htmlFor="phone">電話番号</label>
              <input id="phone" name="phone" placeholder="例: 045-000-0000" />
            </div>
            <div className="field">
              <label htmlFor="industry_detail_key">業態</label>
              <select
                id="industry_detail_key"
                name="industry_detail_key"
                value={selectedIndustry}
                onChange={(event) => setSelectedIndustry(event.target.value)}
              >
                {publicIndustryOptions.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="store_count">店舗数</label>
              <input id="store_count" name="store_count" type="number" min="1" defaultValue="1" />
            </div>
          </div>
        </section>

        <section className="stack">
          <div>
            <p className="muted">Step 2</p>
            <h2>Web・SNS・参考URL</h2>
            <p className="muted">分かる範囲で入力してください。AIOが導入前の初期整理に活用します。</p>
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="website_url">公式ホームページURL</label>
              <input id="website_url" name="website_url" type="url" placeholder="https://example.com" />
            </div>
            <div className="field">
              <label htmlFor="google_maps_url">Googleマップ / GoogleビジネスプロフィールURL</label>
              <input id="google_maps_url" name="google_maps_url" type="url" placeholder="https://maps.google.com/..." />
            </div>
            <div className="field">
              <label htmlFor="instagram_url">Instagram URL</label>
              <input id="instagram_url" name="instagram_url" type="url" placeholder="https://instagram.com/..." />
            </div>
            <div className="field">
              <label htmlFor="line_url">LINE公式アカウントURL</label>
              <input id="line_url" name="line_url" type="url" placeholder="https://lin.ee/..." />
            </div>
          </div>
          <div className="field">
            <label htmlFor="other_social_urls">その他SNS URL</label>
            <textarea id="other_social_urls" name="other_social_urls" placeholder={"https://x.com/...\nhttps://facebook.com/...\nhttps://tiktok.com/..."} />
          </div>
          <div className="field">
            <label htmlFor="reference_urls">参考URL</label>
            <textarea id="reference_urls" name="reference_urls" placeholder={"https://example.com/menu\nhttps://example.com/reviews"} />
          </div>
        </section>

        <section className="stack">
          <div>
            <p className="muted">Step 3</p>
            <h2>いま使っているもの・改善したいこと</h2>
            <p className="muted">{selectedIndustryLabel}で使っているツールや、特に整えたいことを選んでください。</p>
          </div>
          <div className="grid cols-2">
            <article className="mini-card">
              <h3>いま使っているツール</h3>
              <div className="grid">
                {currentToolOptions.map((tool) => (
                  <label className="check-row" key={tool}>
                    <input type="checkbox" name="current_tools" value={tool} />
                    {tool}
                  </label>
                ))}
              </div>
            </article>
            <article className="mini-card">
              <h3>特に改善したいこと</h3>
              <div className="grid">
                {improvementGoalOptions.map((goal) => (
                  <label className="check-row" key={goal}>
                    <input type="checkbox" name="improvement_goals" value={goal} />
                    {goal}
                  </label>
                ))}
              </div>
            </article>
          </div>
          <div className="field">
            <label htmlFor="pain_points">いま困っていること・改善したいこと</label>
            <textarea id="pain_points" name="pain_points" required placeholder="例: 請求や入金確認に時間がかかる、SNS投稿が続かない、売上の振り返りができていない など" />
          </div>
          <div className="field">
            <label htmlFor="message">その他、相談したいこと</label>
            <textarea id="message" name="message" placeholder="導入時期、店舗数、既存ツール、相談したい内容など" />
          </div>
        </section>

        <section className="card subtle-card">
          <h2>送信すると、AIOが初期整理を行います</h2>
          <p>入力内容をもとに、お店の概要、活かせそうなポイント、最初に整えると良さそうな項目をまとめます。</p>
        </section>

        <div className="form-actions">
          <button className="button" type="submit" disabled={state.status === "loading"}>
            {state.status === "loading" ? "AIが整理中..." : "導入相談を送信"}
          </button>
        </div>
      </form>

      {state.status === "loading" ? (
        <section className="card">
          <p className="muted">AIが店舗情報を整理しています</p>
          <h2>お店の特徴を読み取り中です</h2>
          <ul className="compact-list">
            <li>Webサイトや入力内容から、お店の特徴を整理しています。</li>
            <li>導入時に活かせそうなポイントをまとめています。</li>
            <li>担当者がご案内しやすいよう、初回設定の候補を作成しています。</li>
          </ul>
        </section>
      ) : null}

      {state.status === "error" ? <p className="notice danger">{state.message}</p> : null}

      {state.status === "success" ? (
        <section className="card success-card">
          <p className="muted">送信完了</p>
          <h2>導入相談を受け付けました</h2>
          <p>{state.message}</p>
          <div className="grid cols-3">
            <article className="mini-card">
              <h3>お店のまとめ</h3>
              <p>{state.analysis.business_summary}</p>
            </article>
            <article className="mini-card">
              <h3>AIOで活かせそうなポイント</h3>
              <ul className="compact-list">
                {state.analysis.growth_opportunities.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className="mini-card">
              <h3>最初に整えると良さそうな項目</h3>
              <ul className="compact-list">
                {state.analysis.recommended_setup_steps.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>
          <section className="notice">
            この内容をもとに、担当者が導入イメージを整理してご連絡します。
            {state.applicationId ? <span> 受付ID: {state.applicationId}</span> : null}
          </section>
        </section>
      ) : null}
    </div>
  );
}
