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
              <tr><th>店舗名</th><td>{application.store_name}</td></tr>
              <tr><th>担当者</th><td>{application.contact_name}</td></tr>
              <tr><th>メール</th><td>{application.email}</td></tr>
              <tr><th>電話</th><td>{application.phone ?? "-"}</td></tr>
              <tr><th>業態</th><td>{application.industry_type_key ?? "general_store"}</td></tr>
              <tr><th>店舗数</th><td>{application.store_count}</td></tr>
              <tr><th>課題</th><td>{application.pain_points ?? "-"}</td></tr>
              <tr><th>備考</th><td>{application.message ?? "-"}</td></tr>
            </tbody>
          </table>
        </article>
        <article className="card">
          <h2>利用開始準備</h2>
          <table className="table compact">
            <tbody>
              <tr><th>組織</th><td>{application.organization_id ?? "未作成"}</td></tr>
              <tr><th>店舗</th><td>{application.store_id ? <Link href={`/stores/${application.store_id}`}>{application.store_id}</Link> : "未作成"}</td></tr>
              <tr><th>招待メール</th><td>{application.invite_email ?? application.email}</td></tr>
              <tr><th>招待状態</th><td>{application.invitation_status ?? "not_started"}</td></tr>
              <tr><th>アカウント</th><td>{accountStatusLabels[application.account_status ?? "not_created"] ?? application.account_status ?? "未発行"}</td></tr>
              <tr><th>オンボーディング</th><td>{application.onboarding_status ?? "not_started"}</td></tr>
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
              <input id="scheduled_demo_at" name="scheduled_demo_at" type="datetime-local" defaultValue={application.scheduled_demo_at?.slice(0, 16) ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="billing_status">請求状況</label>
              <select id="billing_status" name="billing_status" defaultValue={application.billing_status ?? "not_issued"}>
                {billingStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="billing_amount">請求金額メモ</label>
              <input id="billing_amount" name="billing_amount" type="number" defaultValue={application.billing_amount ?? ""} placeholder="例: 30000" />
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
                <td>{new Date(log.created_at).toLocaleString("ja-JP")}</td>
                <td>{log.action_type}</td>
                <td>{log.from_status ?? "-"} → {log.to_status ?? "-"}</td>
                <td>{log.message ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 ? <p className="empty">まだ対応履歴はありません。</p> : null}
      </section>
    </AppShell>
  );
}
