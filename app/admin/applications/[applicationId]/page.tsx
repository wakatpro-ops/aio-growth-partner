import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  accountStatusLabels,
  applicationStatuses,
  applicationStatusLabel,
  approvalStatusLabels,
  billingStatusLabels,
  getApplication,
  loginGuideTemplate,
  paymentStatusLabels,
  prepareApplicationAccountAction,
  updateApplicationSalesAction
} from "@/lib/admin/applications";

const billingStatuses = [
  ["not_issued", "未発行"],
  ["issued", "請求書発行済み"],
  ["paid", "入金確認済み"],
  ["canceled", "取消"]
] as const;

const paymentStatuses = [
  ["unpaid", "未入金"],
  ["pending", "確認中"],
  ["paid", "入金確認済み"],
  ["canceled", "取消"]
] as const;

const approvalStatuses = [
  ["pending", "未承認"],
  ["approved", "承認済み"],
  ["rejected", "見送り"]
] as const;

function displayValue(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function dateTimeLocalValue(value: unknown) {
  return typeof value === "string" ? value.slice(0, 16) : "";
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
}

function listFromUnknown(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map(String).filter(Boolean);
}

function recordFromUnknown(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function applicationEnrichment(application: NonNullable<Awaited<ReturnType<typeof getApplication>>["application"]>) {
  const fallback = recordFromUnknown(recordFromUnknown(application.admin_checklist)?.public_application_enrichment);
  const social = recordFromUnknown(application.social_urls ?? fallback.social_urls);
  const socialUrls = [
    social.instagram ? `Instagram: ${String(social.instagram)}` : "",
    social.line ? `LINE: ${String(social.line)}` : "",
    ...listFromUnknown(social.other)
  ].filter(Boolean);

  return {
    industryLabel: application.industry_label ?? String(fallback.industry_label ?? ""),
    websiteUrl: application.website_url ?? String(fallback.website_url ?? ""),
    googleMapsUrl: application.google_maps_url ?? String(fallback.google_maps_url ?? ""),
    socialUrls,
    referenceUrls: application.reference_urls ?? listFromUnknown(fallback.reference_urls),
    currentTools: application.current_tools ?? listFromUnknown(fallback.current_tools),
    improvementGoals: application.improvement_goals ?? listFromUnknown(fallback.improvement_goals),
    businessSummary: application.ai_business_summary ?? String(fallback.ai_business_summary ?? ""),
    setupSteps: application.ai_recommended_setup_steps ?? listFromUnknown(fallback.ai_recommended_setup_steps),
    opportunities: application.ai_growth_opportunities ?? listFromUnknown(fallback.ai_growth_opportunities),
    meetingPoints: application.ai_first_meeting_points ?? listFromUnknown(fallback.ai_first_meeting_points),
    analysisStatus: application.ai_analysis_status ?? String(fallback.ai_analysis_status ?? ""),
    analysisError: application.ai_analysis_error ?? String(fallback.ai_analysis_error ?? ""),
    analyzedAt: application.ai_analyzed_at ?? String(fallback.ai_analyzed_at ?? "")
  };
}

export default async function AdminApplicationDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ saved?: string; prepared?: string; error?: string }>;
}) {
  const { applicationId } = await params;
  const query = await searchParams;
  const { application, logs } = await getApplication(applicationId);
  if (!application) notFound();

  const canPrepareAccount = (
    application.status === "payment_confirmed" ||
    application.status === "approved" ||
    application.payment_status === "paid"
  );
  const guide = loginGuideTemplate(application);
  const enrichment = applicationEnrichment(application);

  return (
    <AppShell>
      <PageHeader
        title="申込詳細"
        description="営業メモ、請求状況、入金確認、承認、利用開始準備を管理します。"
        action={<Link className="button secondary" href="/admin/applications">一覧へ戻る</Link>}
      />
      {query.saved ? <p className="notice success">申込情報を保存しました。</p> : null}
      {query.prepared ? <p className="notice success">利用開始準備を更新しました。パスワードは管理画面に表示しません。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

      <section className="grid cols-4">
        <article className="card"><p className="muted">営業</p><div className="metric">{applicationStatusLabel[application.status] ?? application.status}</div></article>
        <article className="card"><p className="muted">請求</p><div className="metric">{billingStatusLabels[application.billing_status ?? "not_issued"] ?? "未発行"}</div></article>
        <article className="card"><p className="muted">入金</p><div className="metric">{paymentStatusLabels[application.payment_status ?? "unpaid"] ?? "未入金"}</div></article>
        <article className="card"><p className="muted">承認</p><div className="metric">{approvalStatusLabels[application.approval_status ?? "pending"] ?? "未承認"}</div></article>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>申込内容</h2>
          <table className="table compact">
            <tbody>
              <tr><th>店舗名</th><td>{displayValue(application.store_name)}</td></tr>
              <tr><th>担当者</th><td>{displayValue(application.contact_name)}</td></tr>
              <tr><th>メール</th><td>{displayValue(application.email)}</td></tr>
              <tr><th>電話</th><td>{displayValue(application.phone)}</td></tr>
              <tr><th>業態</th><td>{displayValue(enrichment.industryLabel || application.industry_type_key, "general_store")}</td></tr>
              <tr><th>店舗数</th><td>{displayValue(application.store_count)}</td></tr>
              <tr><th>課題</th><td>{displayValue(application.pain_points)}</td></tr>
              <tr><th>備考</th><td>{displayValue(application.message)}</td></tr>
            </tbody>
          </table>
        </article>
        <article className="card">
          <h2>利用開始準備</h2>
          <table className="table compact">
            <tbody>
              <tr><th>組織</th><td>{displayValue(application.organization_id, "未作成")}</td></tr>
              <tr><th>店舗</th><td>{application.store_id ? <Link href={`/stores/${application.store_id}`}>{application.store_id}</Link> : "未作成"}</td></tr>
              <tr><th>招待メール</th><td>{displayValue(application.invite_email ?? application.email)}</td></tr>
              <tr><th>招待状態</th><td>{displayValue(application.invitation_status, "not_started")}</td></tr>
              <tr><th>アカウント</th><td>{accountStatusLabels[application.account_status ?? "not_created"] ?? application.account_status ?? "未発行"}</td></tr>
              <tr><th>オンボーディング</th><td>{displayValue(application.onboarding_status, "not_started")}</td></tr>
            </tbody>
          </table>
          <p className="notice">
            申し込みだけでは利用開始できません。入金確認後、管理者が承認して利用開始準備を行います。
            パスワードや秘密情報は管理画面に平文表示しません。
          </p>
          <form action={prepareApplicationAccountAction.bind(null, application.id)}>
            <button className="button" type="submit" disabled={!canPrepareAccount}>
              承認して利用開始準備
            </button>
          </form>
          {!canPrepareAccount ? <p className="muted">入金確認済みにしてから実行してください。</p> : null}
        </article>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>Web・SNS・参考URL</h2>
          <table className="table compact">
            <tbody>
              <tr><th>公式サイト</th><td>{enrichment.websiteUrl ? <a href={enrichment.websiteUrl} target="_blank">{enrichment.websiteUrl}</a> : "-"}</td></tr>
              <tr><th>Googleマップ</th><td>{enrichment.googleMapsUrl ? <a href={enrichment.googleMapsUrl} target="_blank">{enrichment.googleMapsUrl}</a> : "-"}</td></tr>
              <tr><th>SNS</th><td>{enrichment.socialUrls.length ? enrichment.socialUrls.map((url) => <p key={url}>{url}</p>) : "-"}</td></tr>
              <tr><th>参考URL</th><td>{enrichment.referenceUrls.length ? enrichment.referenceUrls.map((url) => <p key={url}>{url}</p>) : "-"}</td></tr>
            </tbody>
          </table>
        </article>
        <article className="card">
          <h2>ツール・改善したいこと</h2>
          <table className="table compact">
            <tbody>
              <tr><th>利用中ツール</th><td>{enrichment.currentTools.length ? enrichment.currentTools.join("、") : "-"}</td></tr>
              <tr><th>改善テーマ</th><td>{enrichment.improvementGoals.length ? enrichment.improvementGoals.join("、") : "-"}</td></tr>
              <tr><th>AI整理状態</th><td>{displayValue(enrichment.analysisStatus, "-")}</td></tr>
              <tr><th>整理日時</th><td>{formatDateTime(enrichment.analyzedAt)}</td></tr>
              {enrichment.analysisError ? <tr><th>AI補足</th><td>{enrichment.analysisError}</td></tr> : null}
            </tbody>
          </table>
        </article>
      </section>

      <section className="card">
        <h2>AIによる初期整理</h2>
        <div className="grid cols-2">
          <article className="mini-card">
            <h3>お店のまとめ</h3>
            <p>{enrichment.businessSummary || "まだ初期整理はありません。"}</p>
          </article>
          <article className="mini-card">
            <h3>AIOで活かせそうな提案</h3>
            {enrichment.opportunities.length ? (
              <ul className="compact-list">
                {enrichment.opportunities.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : <p>-</p>}
          </article>
          <article className="mini-card">
            <h3>最初に整える項目</h3>
            {enrichment.setupSteps.length ? (
              <ul className="compact-list">
                {enrichment.setupSteps.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : <p>-</p>}
          </article>
          <article className="mini-card">
            <h3>初回商談で確認すること</h3>
            {enrichment.meetingPoints.length ? (
              <ul className="compact-list">
                {enrichment.meetingPoints.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : <p>-</p>}
          </article>
        </div>
      </section>

      <section className="card">
        <h2>営業・請求・入金・承認ステータス</h2>
        <form className="form-grid" action={updateApplicationSalesAction.bind(null, application.id)}>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="status">申込ステータス</label>
              <select id="status" name="status" defaultValue={application.status}>
                {applicationStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="scheduled_demo_at">説明予定日時</label>
              <input id="scheduled_demo_at" name="scheduled_demo_at" type="datetime-local" defaultValue={dateTimeLocalValue(application.scheduled_demo_at)} />
            </div>
            <div className="field">
              <label htmlFor="billing_status">請求状況</label>
              <select id="billing_status" name="billing_status" defaultValue={application.billing_status ?? "not_issued"}>
                {billingStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="billing_amount">請求金額メモ</label>
              <input id="billing_amount" name="billing_amount" type="number" defaultValue={application.billing_amount == null ? "" : String(application.billing_amount)} placeholder="例: 30000" />
            </div>
            <div className="field">
              <label htmlFor="payment_status">入金状況</label>
              <select id="payment_status" name="payment_status" defaultValue={application.payment_status ?? "unpaid"}>
                {paymentStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="approval_status">承認状況</label>
              <select id="approval_status" name="approval_status" defaultValue={application.approval_status ?? "pending"}>
                {approvalStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="billing_memo">請求・入金メモ</label>
            <textarea id="billing_memo" name="billing_memo" defaultValue={application.billing_memo ?? ""} placeholder="請求書番号、入金予定日、請求書ベース運用のメモなど" />
          </div>
          <div className="field">
            <label htmlFor="sales_notes">営業メモ</label>
            <textarea id="sales_notes" name="sales_notes" defaultValue={application.sales_notes ?? ""} placeholder="説明内容、懸念点、次回対応、見送り理由など" />
          </div>
          <button className="button" type="submit">保存</button>
        </form>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>ログイン案内テンプレート</h2>
          <p>自動メール送信はまだ行いません。MVPでは管理者が内容を確認して、メールやチャットで手動案内します。</p>
          <textarea className="copy-box" readOnly value={guide} />
        </article>
        <article className="card">
          <h2>AIO利用料の課金メモ</h2>
          <ul className="compact-list">
            <li>AIO運営側の月額利用料は、MVP期間中は請求書ベースで運用します。</li>
            <li>Stripe Subscription / Checkout は後続フェーズです。</li>
            <li>店舗側Stripe/freee連携は、店舗のお客様決済・会計連携用であり、AIO利用料とは別です。</li>
            <li>入金確認前に本利用開始しない運用にしてください。</li>
          </ul>
        </article>
      </section>

      <section className="card">
        <h2>対応履歴</h2>
        <table className="table">
          <thead>
            <tr>
              <th>日時</th>
              <th>操作</th>
              <th>変更</th>
              <th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.created_at)}</td>
                <td>{displayValue(log.action_type)}</td>
                <td>{displayValue(log.from_status)} → {displayValue(log.to_status)}</td>
                <td>{displayValue(log.message)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 ? <p className="empty">まだ対応履歴はありません。</p> : null}
      </section>
    </AppShell>
  );
}
