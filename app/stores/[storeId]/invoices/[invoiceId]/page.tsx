import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { CopyButton } from "@/components/ui/copy-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getDocument, listCustomers } from "@/lib/phase2/business-data";
import { listPdfIssues } from "@/lib/phase6/compliance-data";
import { getInvoiceStripePayment } from "@/lib/phase6/stripe-payments";
import { labelFor, paymentRecordStatusLabels, paymentStatusLabels } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";
import { deleteInvoiceAction, updateInvoiceAction } from "../../business/actions";
import { createStripeCheckoutAction, sendPaymentReceiptEmailAction } from "../../compliance/actions";

const receiptIssueLabels: Record<string, string> = { issue: "発行", reissue: "再発行", send: "メール送付", resend: "メール再送" };
const receiptDeliveryLabels: Record<string, string> = { created: "作成済み", downloaded: "ダウンロード済み", sent: "送信済み", failed: "送信失敗", skipped: "未送信" };

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; invoiceId: string }>; searchParams: Promise<{ stripeSaved?: string; paid?: string; stripeError?: string; stripeCheckout?: string; receiptSent?: string; receiptError?: string }> }) {
  const { storeId, invoiceId } = await params;
  const notices = await searchParams;
  const store = await getStore(storeId);
  const [invoice, customers, pdfIssues, stripePayment] = await Promise.all([
    getDocument(store.id, invoiceId, "invoices"),
    listCustomers(store.id),
    listPdfIssues(store.id, invoiceId),
    getInvoiceStripePayment(store.id, invoiceId)
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
        action={(
          <div className="action-row">
            {isFeatureEnabled(flags, "pdf_export") ? <>
            <Link className="button" href={`/stores/${store.id}/invoices/${invoice.id}/pdf/download`}>PDF出力</Link>
            <Link className="button secondary" href={`/stores/${store.id}/invoices/${invoice.id}/pdf`}>印刷プレビュー</Link>
            </> : null}
          </div>
        )}
      />
      {notices.stripeSaved ? <p className="notice success">Stripe決済URLを保存しました。</p> : null}
      {notices.stripeCheckout === "created" ? <p className="notice success">この請求書専用のStripe決済URLを作成しました。内容を確認して顧客へ共有してください。</p> : null}
      {notices.stripeCheckout === "success" ? <p className="notice success">Stripeの支払い画面から戻りました。入金状態はWebhook確認後に自動更新されます。</p> : null}
      {notices.stripeCheckout === "cancelled" ? <p className="notice">Stripe決済は完了していません。必要なら同じ決済URLからやり直せます。</p> : null}
      {notices.receiptSent ? <p className="notice success">領収書をメール送付しました。</p> : null}
      {notices.receiptError ? <p className="notice danger">{decodeURIComponent(notices.receiptError)}</p> : null}
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
          <strong>{labelFor(paymentStatusLabels, invoice.payment_status)}</strong>
        </article>
      </section>
      <section className="card form">
        <h2>Stripe決済URL</h2>
        <p className="muted">店舗の接続済みStripeアカウントに、この請求書専用の安全な決済画面を作ります。AIO boost利用料の決済とは分離されています。</p>
        <div className="grid cols-3">
          <article className="mini-card">
            <p className="muted">決済ステータス</p>
            <strong>{labelFor(paymentRecordStatusLabels, invoice.stripe_payment_status, "未作成")}</strong>
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
        <div className="action-row">
          <form action={createStripeCheckoutAction.bind(null, store.id, invoice.id)}>
            <PendingSubmitButton pendingLabel="Stripe決済URLを作成しています..." disabled={invoice.payment_status === "paid"}>Stripe決済URLを自動作成</PendingSubmitButton>
          </form>
          {invoice.stripe_payment_url ? <><CopyButton value={invoice.stripe_payment_url} label="決済URLをコピー" /><Link className="button secondary" href={invoice.stripe_payment_url} target="_blank">決済画面を確認</Link></> : null}
        </div>
        {stripePayment.transaction ? (
          <dl className="definition-list">
            <div><dt>自動連携状態</dt><dd>{labelFor(paymentRecordStatusLabels, String(stripePayment.transaction.status ?? "pending"))}</dd></div>
            <div><dt>決済額</dt><dd>{Number(stripePayment.transaction.amount ?? 0).toLocaleString("ja-JP")}円</dd></div>
            <div><dt>返金額</dt><dd>{Number(stripePayment.transaction.amount_refunded ?? 0).toLocaleString("ja-JP")}円</dd></div>
            <div><dt>最終イベント</dt><dd>{stripePayment.transaction.event_created_at ? new Date(stripePayment.transaction.event_created_at).toLocaleString("ja-JP") : "決済待ち"}</dd></div>
          </dl>
        ) : null}
        <details>
          <summary>手動でStripe情報を登録する</summary>
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
        </details>
        <details>
          <summary>Webhookを使わず手動で入金確認する</summary>
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
        </details>
      </section>
      {stripePayment.receipt ? (
        <section className="card">
          <h2>領収書</h2>
          <dl className="definition-list">
            <div><dt>領収書番号</dt><dd>{stripePayment.receipt.receipt_number}</dd></div>
            <div><dt>状態</dt><dd>{stripePayment.receipt.status === "issued" ? "発行済み" : stripePayment.receipt.status === "void" ? "取消済み" : stripePayment.receipt.status === "partially_refunded" ? "一部返金" : stripePayment.receipt.status}</dd></div>
            <div><dt>金額</dt><dd>{Number(stripePayment.receipt.amount).toLocaleString("ja-JP")}円</dd></div>
            <div><dt>最終送付</dt><dd>{stripePayment.receipt.last_sent_at ? new Date(stripePayment.receipt.last_sent_at).toLocaleString("ja-JP") : "未送付"}</dd></div>
          </dl>
          <div className="action-row">
            <Link className="button secondary" href={`/stores/${store.id}/receipts/${stripePayment.receipt.id}/pdf`}>領収書PDFを出力</Link>
          </div>
          <form className="grid cols-3" action={sendPaymentReceiptEmailAction.bind(null, store.id, invoice.id, stripePayment.receipt.id)}>
            <div className="field"><label htmlFor="recipient_email">送付先メール</label><input id="recipient_email" name="recipient_email" type="email" required defaultValue={invoice.customer?.email ?? ""} /></div>
            <div className="field"><label htmlFor="reissue_reason">再送・再発行理由</label><input id="reissue_reason" name="reissue_reason" placeholder="例: お客様から再送依頼" /></div>
            <PendingSubmitButton disabled={stripePayment.receipt.status !== "issued"} pendingLabel="領収書を送信しています...">領収書をメール送付</PendingSubmitButton>
          </form>
          <h3>発行・送付履歴</h3>
          <table className="table compact"><thead><tr><th>日時</th><th>種類</th><th>送付状態</th><th>理由</th></tr></thead><tbody>
            {stripePayment.issues.map((issue) => <tr key={issue.id}><td>{new Date(issue.created_at).toLocaleString("ja-JP")}</td><td>{receiptIssueLabels[String(issue.issue_type)] ?? issue.issue_type}</td><td>{receiptDeliveryLabels[String(issue.delivery_status)] ?? issue.delivery_status ?? "-"}</td><td>{issue.reissue_reason ?? issue.error_message ?? "-"}</td></tr>)}
            {stripePayment.issues.length === 0 ? <tr><td colSpan={4}>履歴はまだありません。</td></tr> : null}
          </tbody></table>
        </section>
      ) : null}
      <DocumentForm action={updateInvoiceAction.bind(null, store.id, invoice.id)} document={invoice} customers={customers} kind="invoice" industryTypeKey={store.industry_type_key} />
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
        <ConfirmSubmitButton message={`請求書「${invoice.document_number}」を削除します。入金・PDF発行・監査履歴は保持され、削除済みデータから元に戻せます。`}>削除</ConfirmSubmitButton>
      </form>
    </AppShell>
  );
}
