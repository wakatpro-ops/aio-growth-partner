import type { Metadata } from "next";
import Link from "next/link";
import { approvedAnalysisDetail } from "@/lib/applications/analysis-presentation";
import { verifyOperatorReviewToken } from "@/lib/applications/operator-review-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "詳細診断 | AIO boost", robots: { index: false, follow: false } };

function valueOrPending(value: string | string[]) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "まだ確認できていません";
  return value || "まだ確認できていません";
}

function originLabel(value: unknown) {
  if (value === "published") return "公開ページで確認";
  if (value === "inferred") return "AIの推定・要確認";
  return "未確認";
}

export default async function ApprovedDiagnosisPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const verifiedToken = token ? verifyOperatorReviewToken(token) : null;
  const supabase = createSupabaseAdminClient();
  let detail: ReturnType<typeof approvedAnalysisDetail> | null = null;
  let contactName = "";
  if (verifiedToken && supabase) {
    const { data: application } = await supabase.from("applications")
      .select("contact_name, source_analysis_id, intake_review_status")
      .eq("id", verifiedToken.applicationId)
      .maybeSingle();
    if (application?.intake_review_status === "approved" && application.source_analysis_id) {
      const { data: analysis } = await supabase.from("public_store_analyses").select("*").eq("id", application.source_analysis_id).maybeSingle();
      if (analysis) {
        contactName = application.contact_name;
        detail = approvedAnalysisDetail({
          profile: analysis.extracted_profile,
          diagnosis: analysis.analysis_result,
          sourceUrl: analysis.source_url,
          finalUrl: analysis.final_url,
          status: analysis.status,
          aiStatus: analysis.ai_status
        });
      }
    }
  }

  if (!detail) {
    return (
      <main className="main" style={{ maxWidth: 760, margin: "0 auto" }}>
        <section className="card stack"><p className="eyebrow">AIO boost 詳細診断</p><h1>詳細診断を表示できません</h1><p>リンクの有効期限が切れているか、申込がまだ確認中、追加確認中、または見送りになっている可能性があります。</p><p>承認メールに記載された最新のリンクをご確認ください。ご不明点は info@aioboost.jp へお問い合わせください。</p><Link className="button secondary" href="/apply">簡易診断へ戻る</Link></section>
      </main>
    );
  }

  const profile = detail.profile;
  const diagnosis = detail.diagnosis;
  return (
    <main className="main" style={{ maxWidth: 920, margin: "0 auto" }}>
      <div className="stack analysis-result">
        <div><p className="eyebrow">株式会社 Navi Life 確認済み</p><h1>{contactName}様のAIO詳細診断</h1><p>申込内容の事前確認が完了しました。公開情報を基にした診断のため、内容は確定情報ではなく、検索順位やAIからの推薦を保証するものではありません。</p></div>
        <section className="card analysis-hero">
          <div><p className="eyebrow">AIの読み取り結果</p><h2>{profile.store_name || "店舗名を確認できませんでした"}</h2><p>{diagnosis.business_summary}</p></div>
          <div className="readiness-score"><span>AIおすすめ準備度</span><strong>{diagnosis.readiness_score}%</strong><small>検索順位や推薦を保証する数値ではありません</small></div>
        </section>
        <section className="ai-question-panel"><p className="eyebrow">お客様がAIに尋ねそうな質問</p><div className="grid cols-3">{diagnosis.target_questions.map((question, index) => <article className="static-card" key={question}><span>想定質問 {index + 1}</span><strong>「{question}」</strong></article>)}</div></section>
        <section className="card first-priority-card"><p className="step-label">最初に改善すると良いこと</p><h2>{String(diagnosis.top_improvement.title ?? "")}</h2><p>{String(diagnosis.top_improvement.description ?? "")}</p></section>
        <section className="card"><p className="eyebrow">診断の根拠</p><h2>どこまで準備できているか</h2><div className="grid cols-3">{diagnosis.readiness_items.map((raw, index) => { const item = raw as Record<string, unknown>; return <article className="static-card" key={String(item.key ?? index)}><span>{String(item.status ?? "")}</span><strong>{String(item.label ?? "")} {Number(item.earned ?? 0)}/{Number(item.weight ?? 0)}</strong><p>{String(item.detail ?? "")}</p></article>; })}</div></section>
        <section className="card"><p className="eyebrow">公開ページから確認した内容</p><h2>管理画面へ引き継げる店舗情報</h2><div className="grid cols-2 extracted-profile-grid">{[
          ["store_name", "店舗名", profile.store_name], ["industry_key", "業態", profile.industry_label], ["address", "住所・地域", profile.address], ["phone", "店舗電話番号", profile.phone], ["opening_hours", "営業時間", profile.opening_hours], ["services", "メニュー・サービス", profile.services], ["strengths", "特徴・強み", profile.strengths], ["target_customers", "おすすめしたいお客様", profile.target_customers]
        ].map(([key, label, value]) => <article className="static-card" key={String(key)}><span>{originLabel(profile.field_origins[String(key)])}</span><strong>{String(label)}</strong><p>{valueOrPending(value as string | string[])}</p></article>)}</div></section>
        <section className="card"><h2>次の流れ</h2><ol className="compact-list"><li>詳細診断について担当者からご案内します。</li><li>電子契約と請求内容を確認します。</li><li>契約・入金確認後に、診断結果を引き継いだ専用管理画面を発行します。</li></ol><p className="notice">この詳細診断の承認だけで契約成立、請求、外部投稿、アカウント発行は行われません。</p></section>
      </div>
    </main>
  );
}
