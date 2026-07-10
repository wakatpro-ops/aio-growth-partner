"use client";

import type { IndustryConfig, Store } from "@/types/domain";
import type { BusinessDocument } from "@/types/phase2";

function formatCurrency(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(value));
}

export function DocumentPrintView({
  document,
  industry,
  kind,
  store
}: {
  document: BusinessDocument;
  industry: IndustryConfig;
  kind: "estimate" | "invoice";
  store: Store;
}) {
  const documentLabel = kind === "estimate" ? industry.businessLabels.estimate : industry.businessLabels.invoice;
  const limitLabel = kind === "estimate" ? "有効期限" : "支払期限";
  const limitValue = kind === "estimate" ? document.expiry_date : document.due_date;
  const issuerName = kind === "invoice" ? document.qualified_invoice_issuer_name || store.name : store.name;

  return (
    <main className="print-page">
      <div className="print-actions">
        <a className="button" href={kind === "estimate" ? `/stores/${store.id}/estimates/${document.id}/pdf/download` : `/stores/${store.id}/invoices/${document.id}/pdf/download`}>PDFダウンロード</a>
        <button className="button secondary" type="button" onClick={() => globalThis.print()}>印刷</button>
        <a className="button secondary" href={kind === "estimate" ? `/stores/${store.id}/estimates/${document.id}` : `/stores/${store.id}/invoices/${document.id}`}>編集へ戻る</a>
      </div>
      <section className="print-sheet">
        <header className="print-header">
          <div>
            <p className="print-eyebrow">{industry.name}</p>
            <h1>{documentLabel}</h1>
          </div>
          <div className="print-store">
            <strong>{issuerName}</strong>
            <span>{store.address || "住所未設定"}</span>
            <span>{store.phone || "電話番号未設定"}</span>
          </div>
        </header>

        <section className="print-recipient">
          <div>
            <p className="print-label">顧客名</p>
            <h2>{document.customer?.name ?? "未選択"}</h2>
            {document.customer?.company_name ? <p>{document.customer.company_name}</p> : null}
          </div>
          <dl className="print-meta">
            <div><dt>{documentLabel}番号</dt><dd>{document.document_number}</dd></div>
            <div><dt>発行日</dt><dd>{formatDate(document.issue_date)}</dd></div>
            {kind === "invoice" ? <div><dt>取引年月日</dt><dd>{formatDate(document.transaction_date ?? document.issue_date)}</dd></div> : null}
            <div><dt>{limitLabel}</dt><dd>{formatDate(limitValue)}</dd></div>
            {kind === "invoice" ? <div><dt>登録番号</dt><dd>{document.invoice_registration_number ?? "未設定"}</dd></div> : null}
          </dl>
        </section>

        <table className="print-table">
          <tbody>
            {kind === "invoice" ? (
              <>
                <tr><th>10%対象</th><td>{formatCurrency(document.tax_10_subtotal ?? document.subtotal)}</td></tr>
                <tr><th>10%消費税</th><td>{formatCurrency(document.tax_10_amount ?? document.tax_total)}</td></tr>
                <tr><th>8%対象</th><td>{formatCurrency(document.tax_8_subtotal ?? 0)}</td></tr>
                <tr><th>8%消費税</th><td>{formatCurrency(document.tax_8_amount ?? 0)}</td></tr>
              </>
            ) : null}
            <tr><th>小計</th><td>{formatCurrency(document.subtotal)}</td></tr>
            <tr><th>消費税</th><td>{formatCurrency(document.tax_total)}</td></tr>
            <tr className="print-total"><th>合計</th><td>{formatCurrency(document.total)}</td></tr>
          </tbody>
        </table>

        <section className="print-notes">
          <h2>備考</h2>
          <p>{document.notes || "備考はありません。"}</p>
        </section>
      </section>
    </main>
  );
}
