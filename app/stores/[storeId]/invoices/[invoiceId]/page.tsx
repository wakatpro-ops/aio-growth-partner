import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getDocument, listCustomers } from "@/lib/phase2/business-data";
import { listPdfIssues } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { deleteInvoiceAction, updateInvoiceAction } from "../../business/actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ storeId: string; invoiceId: string }> }) {
  const { storeId, invoiceId } = await params;
  const store = await getStore(storeId);
  const [invoice, customers, pdfIssues] = await Promise.all([
    getDocument(store.id, invoiceId, "invoices"),
    listCustomers(store.id),
    listPdfIssues(store.id, invoiceId)
  ]);
  if (!invoice) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);

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
      <DocumentForm action={updateInvoiceAction.bind(null, store.id, invoice.id)} document={invoice} customers={customers} kind="invoice" />
      <section className="card">
        <h2>PDF発行・再発行履歴</h2>
        <form className="form-inline" action={`/stores/${store.id}/invoices/${invoice.id}/pdf/download`} method="get">
          <label htmlFor="reissueReason">再発行理由</label>
          <input id="reissueReason" name="reissueReason" placeholder="例: 金額修正後の再発行" />
          <button className="button secondary" type="submit">理由を記録してPDF出力</button>
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
        <button className="button danger" type="submit">削除</button>
      </form>
    </AppShell>
  );
}
