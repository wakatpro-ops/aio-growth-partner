import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getDocument, listCustomers } from "@/lib/phase2/business-data";
import { listPdfIssues } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { deleteInvoiceAction, updateInvoiceAction } from "../../business/actions";

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; invoiceId: string }>; searchParams: Promise<{ stripeSaved?: string; paid?: string; stripeError?: string }> }) {
  const { storeId, invoiceId } = await params;
  const notices = await searchParams;
  const store = await getStore(storeId);
  const [invoice, customers, pdfIssues] = await Promise.all([
    getDocument(store.id, invoiceId, "invoices"),
    listCustomers(store.id),
    listPdfIssues(store.id, invoiceId)
  ]);
  if (!invoice) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={invoice.title}
        description={`${industry.businessLabels.invoice}を編集します。`}
        action={isFeatureEnabled(flags, "pdf_export") ? (
          <div className="action-row">
            <Link className="button" href={`/stores/${store.id}/invoices/${invoice.id}/pdf/download`}>PDF出力</Link>
            <Link className="button secondary" href={`/stores/${store.id}/invoices/${invoice.id}/pdf`}>印刷プレビュー</Link>
          </div>
        ) : undefined}
      />
      {notices.stripeSaved ? <p className="notice success">Stripe決済URLを保存しました。</p> : null}
      {notices.paid ? <p className="notice success">Stripe決済を入金済みとして記録しました。</p> : null}
      {notices.stripeError ? <p className="notice danger">Stripe連携の保存に失敗しました。{decodeURIComponent(notices.stripeError)}</p> : null}
      <section className="grid cols-3">
        <article className="card">
          <p className="muted">登録番号</p>
          <strong>{invoice.invoice_registration_number ?? "未設定"}</strong>
        </article>
        <article className="card">
          <p className="muted">税率別内訳</p>
          <strong>10%: {(invoice.tax_10_amount ?? invoice.tax_total).toLocaleString("ja-JP")}円 / 8%: {(invoice.tax_8_amount ?? 0).toLocaleString("ja-JP")}円</strong>
        </article>
        <article className="card">
          <p className="muted">入金状態</p>
          <strong>{invoice.payment_status ?? "未設定"}</strong>
        </article>
      </section>
      <section className="card form">
        <h2>Stripe決済URL</h2>
        <p className="muted">この請求書に紐づくStripe決済リンクを登録し、入金状況を管理します。</p>
        <div className="grid cols-3">
          <article className="mini-card">
            <p className="muted">決済ステータス</p>
            <strong>{invoice.stripe_payment_status ?? "not_created"}</strong>
          </article>
          <article className="mini-card">
            <p className="muted">Stripe外部ID</p>
            <strong>{invoice.stripe_payment_id ?? "未登録"}</strong>
          </article>
          <article className="mini-card">
            <p className="muted">決済URL</p>
            <strong>{invoice.stripe_payment_url ? "登録済み" : "未登録"}</strong>
          </article>
        </div>
        <form action={`/stores/${store.id}/invoices/${invoice.id}/stripe-payment`} method="post" className="grid cols-2">
          <div className="field full-span">
            <label htmlFor="stripe_payment_url">Stripe決済URL</label>
            <input id="stripe_payment_url" name="stripe_payment_url" defaultValue={invoice.stripe_payment_url ?? ""} placeholder="https://buy.stripe.com/..." />
          </div>
          <div className="field">
            <label htmlFor="stripe_payment_id">Stripe外部決済ID</label>
            <input id="stripe_payment_id" name="stripe_payment_id" defaultValue={invoice.stripe_payment_id ?? ""} placeholder="pi_... / cs_... / 手動ID" />
          </div>
          <div className="field">
            <label htmlFor="stripe_payment_status">決済ステータス</label>
            <select id="stripe_payment_status" name="stripe_payment_status" defaultValue={invoice.stripe_payment_status ?? "payment_link_created"}>
              <option value="not_created">未作成</option>
              <option value="payment_link_created">決済URL作成済み</option>
              <option value="pending">支払い待ち</option>
              <option value="paid">決済済み</option>
              <option value="failed">失敗</option>
              <option value="cancelled">取消</option>
            </select>
          </div>
          <div className="action-row full-span">
            <PendingSubmitButton pendingLabel="Stripe情報を保存しています...">Stripe情報を保存</PendingSubmitButton>
            <CopyButton value={invoice.stripe_payment_url} label="決済URLをコピー" />
            {invoice.stripe_payment_url ? <Link className="button secondary" href={invoice.stripe_payment_url} target="_blank">決済URLを開く</Link> : null}
          </div>
        </form>
        <form action={`/stores/${store.id}/invoices/${invoice.id}/stripe-payment/paid`} method="post" className="grid cols-3">
          <input type="hidden" name="external_payment_url" value={invoice.stripe_payment_url ?? ""} />
          <div className="field">
            <label htmlFor="stripe_paid_amount">入金額</label>
            <input id="stripe_paid_amount" name="amount" type="number" defaultValue={invoice.total} />
          </div>
          <div className="field">
            <label htmlFor="stripe_paid_date">入金日</label>
            <input id="stripe_paid_date" name="payment_date" type="date" defaultValue={today} />
          </div>
          <div className="field">
            <label htmlFor="stripe_paid_id">外部決済ID</label>
            <input id="stripe_paid_id" name="external_payment_id" defaultValue={invoice.stripe_payment_id ?? ""} />
          </div>
          <div className="field full-span">
            <label htmlFor="stripe_paid_memo">メモ</label>
            <input id="stripe_paid_memo" name="memo" defaultValue="Stripe管理画面で決済済みを確認し、手動で入金済みに変更" />
          </div>
          <PendingSubmitButton className="button secondary" pendingLabel="入金済みとして記録しています...">Stripe決済済みとして入金登録</PendingSubmitButton>
        </form>
      </section>
      <DocumentForm action={updateInvoiceAction.bind(null, store.id, invoice.id)} document={invoice} customers={customers} kind="invoice" />
      <section className="card">
        <h2>PDF発行・再発行履歴</h2>
        <form className="form-inline" action={`/stores/${store.id}/invoices/${invoice.id}/pdf/download`} method="get">
          <label htmlFor="reissueReason">再発行理由</label>
          <input id="reissueReason" name="reissueReason" placeholder="例: 金額修正後の再発行" />
          <PendingSubmitButton className="button secondary" pendingLabel="PDFを準備しています...">理由を記録してPDF出力</PendingSubmitButton>
        </form>
        <table className="table compact">
          <thead><tr><th>日時</th><th>種別</th><th>理由</th><th>ファイル名</th></tr></thead>
          <tbody>
            {pdfIssues.map((issue) => (
              <tr key={issue.id}>
                <td>{new Date(issue.issued_at).toLocaleString("ja-JP")}</td>
                <td>{issue.issue_type === "reissue" ? "再発行" : "発行"}</td>
                <td>{issue.reissue_reason ?? issue.metadata?.reissue_reason ?? "-"}</td>
                <td>{issue.file_name ?? "-"}</td>
              </tr>
            ))}
            {pdfIssues.length === 0 ? <tr><td colSpan={4}>まだPDF発行履歴はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
      <form action={deleteInvoiceAction.bind(null, store.id, invoice.id)} className="danger-zone">
        <PendingSubmitButton className="button danger" pendingLabel="削除しています...">削除</PendingSubmitButton>
      </form>
    </AppShell>
  );
}
