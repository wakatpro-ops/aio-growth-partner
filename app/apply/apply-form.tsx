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

type OperatingModelDraft = {
  version: 1;
  structure: { mode: string; companyNames: string[]; brandNames: string[]; locations: Array<Record<string, string>> };
  systems: Record<string, { authority: string; serviceNames: string[] }>;
  register: { mode: string };
  operations: { serviceMode: string; reservationResources: string[] };
  sharing: Record<string, string>;
  detection: { source: string; notes: string[] };
};

export function ApplyForm() {
  const [stage, setStage] = useState<Stage>("idle");
  const [sourceUrl, setSourceUrl] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [operatingModel, setOperatingModel] = useState<OperatingModelDraft | null>(null);
  const [structureMode, setStructureMode] = useState("single_store");
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
      const nextOperatingModel = data.operating_model_draft as OperatingModelDraft;
      setOperatingModel(nextOperatingModel);
      setStructureMode(nextOperatingModel.structure.mode);
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
      message: String(formData.get("message") ?? ""),
      operating_model: operatingModel ? {
        ...operatingModel,
        structure: {
          ...operatingModel.structure,
          mode: String(formData.get("structure_mode") ?? operatingModel.structure.mode),
          companyNames: String(formData.get("company_names") ?? operatingModel.structure.companyNames.join("、")).split(/[、,\n]/u).map((value) => value.trim()).filter(Boolean),
          brandNames: String(formData.get("brand_names") ?? operatingModel.structure.brandNames.join("、")).split(/[、,\n]/u).map((value) => value.trim()).filter(Boolean),
          locations: [
            ...operatingModel.structure.locations.slice(0, 1),
            ...String(formData.get("additional_locations") ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 9).map((line) => {
              const [name = "", address = "", websiteUrl = ""] = line.split("|").map((value) => value.trim());
              return { name, address, websiteUrl, companyName: "", brandName: "", source: "applicant" };
            })
          ]
        },
        systems: Object.fromEntries(Object.entries(operatingModel.systems).map(([key, value]) => [key, {
          ...value,
          authority: String(formData.get(`system_${key}`) ?? value.authority)
        }])),
        register: { mode: String(formData.get("register_mode") ?? operatingModel.register.mode) },
        operations: {
          serviceMode: String(formData.get("service_mode") ?? operatingModel.operations.serviceMode),
          reservationResources: ["staff", "seat", "room", "equipment", "table", "vehicle", "other"].filter((key) => formData.get(`resource_${key}`) === "on")
        },
        sharing: Object.fromEntries(Object.entries(operatingModel.sharing).map(([key, value]) => [key, String(formData.get(`sharing_${key}`) ?? value)]))
      } : undefined
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
              {operatingModel ? (
                <section className="stack">
                  <div><p className="eyebrow">AIが準備した運営設定</p><h3>お店に必要な機能だけを使うため、5項目をご確認ください</h3><p className="muted">分からない項目は「まだ決めていない」のままで申し込めます。運営会社の承認後、初回設定で編集できます。</p></div>
                  <div className="field"><label htmlFor="structure_mode">1. 店舗・ブランドの構成</label><select id="structure_mode" name="structure_mode" value={structureMode} onChange={(event) => setStructureMode(event.target.value)}><option value="single_store">1法人・1ブランド・1店舗</option><option value="multi_store">同じ法人・ブランドで複数店舗</option><option value="multi_brand">同じ法人で複数ブランド・店舗</option><option value="multi_company">複数法人をまとめて管理したい</option></select>{operatingModel.structure.locations.length > 1 ? <p className="muted">公開ページから {operatingModel.structure.locations.length} 店舗候補を確認しました。正式登録前に個別確認できます。</p> : null}</div>
                  {structureMode !== "single_store" ? <div className="stack"><div className="grid cols-2"><div className="field"><label htmlFor="company_names">法人名（複数は読点区切り）</label><input id="company_names" name="company_names" defaultValue={operatingModel.structure.companyNames.join("、")} /></div><div className="field"><label htmlFor="brand_names">ブランド名（複数は読点区切り）</label><input id="brand_names" name="brand_names" defaultValue={operatingModel.structure.brandNames.join("、")} /></div></div><div className="field"><label htmlFor="additional_locations">追加店舗候補</label><textarea id="additional_locations" name="additional_locations" defaultValue={operatingModel.structure.locations.slice(1).map((item) => `${item.name} | ${item.address} | ${item.websiteUrl}`).join("\n")} placeholder={'1行に1店舗：店舗名 | 住所 | 店舗URL\n例：中野店 | 東京都中野区… | https://…'} /><p className="muted">AIが確認できなかった店舗だけ追記してください。初回設定で登録する店舗を選べます。</p></div></div> : null}
                  <div className="field"><span className="field-label">2. 既存システムとの役割分担</span><div className="grid cols-2">{Object.entries(operatingModel.systems).map(([key, value]) => <label key={key}>{({ sales: "売上", reservations: "予約", customers: "顧客", inventory: "在庫", accounting: "会計" } as Record<string, string>)[key] ?? key}<select name={`system_${key}`} defaultValue={value.authority}><option value="aio_boost">AIO boostで管理</option><option value="external">既存システムを正本にする</option><option value="file_import">CSV・Excel取込で連携</option><option value="not_managed">管理しない</option></select>{value.serviceNames.length ? <small>検出: {value.serviceNames.join("、")}</small> : null}</label>)}</div></div>
                  <div className="field"><label htmlFor="register_mode">3. 会計・レジの使い方</label><select id="register_mode" name="register_mode" defaultValue={operatingModel.register.mode}><option value="undecided">まだ決めていない</option><option value="external_pos">既存のPOS・レジを使う</option><option value="simple_register">AIO boostの簡易会計を使う</option><option value="not_needed">レジ機能は不要</option></select></div>
                  <div className="field"><label htmlFor="service_mode">4. 予約・スタッフ・設備の運用</label><select id="service_mode" name="service_mode" defaultValue={operatingModel.operations.serviceMode}><option value="reservation_only">予約制</option><option value="walk_in_only">予約なし・来店順</option><option value="both">予約と当日受付の両方</option><option value="remote_or_visit">訪問・オンライン対応</option><option value="not_used">予約管理は不要</option></select><div className="checkbox-grid">{[["staff", "スタッフ"], ["seat", "席"], ["room", "部屋"], ["equipment", "設備"], ["table", "テーブル"], ["vehicle", "車両"], ["other", "その他"]].map(([key, label]) => <label className="check-card" key={key}><input type="checkbox" name={`resource_${key}`} defaultChecked={operatingModel.operations.reservationResources.includes(key)} /><span>{label}</span></label>)}</div></div>
                  {structureMode !== "single_store" ? <div className="field"><span className="field-label">5. 店舗間で共有する情報</span><div className="grid cols-2">{Object.entries(operatingModel.sharing).map(([key, value]) => <label key={key}>{({ menus: "メニュー", invoices: "請求書設定", customers: "顧客", staff: "スタッフ", inventory: "在庫" } as Record<string, string>)[key] ?? key}<select name={`sharing_${key}`} defaultValue={value}><option value="company">法人共通</option><option value="brand">ブランド共通</option><option value="store">店舗ごと</option></select></label>)}</div></div> : null}
                </section>
              ) : null}
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
