import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  accountStatusLabels,
  applicationStatusLabel,
  approvalStatusLabels,
  billingStatusLabels,
  listApplications,
  paymentStatusLabels
} from "@/lib/admin/applications";

export default async function AdminApplicationsPage() {
  const applications = await listApplications();
  const activeApplications = applications.filter((item) => !["account_issued", "declined"].includes(item.status));
  const paid = applications.filter((item) => item.payment_status === "paid" || item.status === "payment_confirmed").length;
  const approved = applications.filter((item) => item.approval_status === "approved" || item.status === "approved" || item.status === "account_issued").length;

  return (
    <AppShell>
      <PageHeader
        title="申し込み管理"
        description="公開フォームからの問い合わせを、説明、請求、入金確認、承認、アカウント発行まで管理します。"
        action={<Link className="button secondary" href="/apply">公開フォームを確認</Link>}
      />
      <section className="grid cols-4">
        <article className="card"><p className="muted">総申込</p><div className="metric">{applications.length}</div></article>
        <article className="card"><p className="muted">営業対応中</p><div className="metric">{activeApplications.length}</div></article>
        <article className="card"><p className="muted">入金確認済み</p><div className="metric">{paid}</div></article>
        <article className="card"><p className="muted">承認済み</p><div className="metric">{approved}</div></article>
      </section>
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>申込一覧</h2>
            <p>AIO利用料はMVP期間中、Stripe自動課金ではなく請求書ベースで運用します。</p>
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>申込日</th>
              <th>店舗</th>
              <th>担当者</th>
              <th>営業ステータス</th>
              <th>請求</th>
              <th>入金</th>
              <th>承認</th>
              <th>アカウント</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id}>
                <td>{new Date(application.created_at).toLocaleDateString("ja-JP")}</td>
                <td>
                  <strong>{application.store_name}</strong>
                  <p className="muted">{application.industry_type_key ?? "general_store"} / {application.store_count}店舗</p>
                </td>
                <td>
                  {application.contact_name}
                  <p className="muted">{application.email}</p>
                </td>
                <td><span className="badge">{applicationStatusLabel[application.status] ?? application.status}</span></td>
                <td>{billingStatusLabels[application.billing_status ?? "not_issued"] ?? application.billing_status ?? "未発行"}</td>
                <td>{paymentStatusLabels[application.payment_status ?? "unpaid"] ?? application.payment_status ?? "未入金"}</td>
                <td>{approvalStatusLabels[application.approval_status ?? "pending"] ?? application.approval_status ?? "未承認"}</td>
                <td>{accountStatusLabels[application.account_status ?? "not_created"] ?? application.account_status ?? "未発行"}</td>
                <td><Link className="button secondary" href={`/admin/applications/${application.id}`}>詳細</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {applications.length === 0 ? <p className="empty">まだ申し込みはありません。公開フォームから送信されるとここに表示されます。</p> : null}
      </section>
      <section className="card">
        <h2>営業・承認フロー</h2>
        <ol className="compact-list">
          <li>広告LPまたは営業導線から公開申し込みフォームへ誘導します。</li>
          <li>管理者がオンライン説明、請求書発行、入金確認を記録します。</li>
          <li>入金確認後に承認し、組織・店舗・招待準備を行います。</li>
          <li>ユーザーはログイン後、初回オンボーディングから利用開始します。</li>
        </ol>
      </section>
    </AppShell>
  );
}
