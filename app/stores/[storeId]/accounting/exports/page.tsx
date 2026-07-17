import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { listDocuments } from "@/lib/phase2/business-data";
import { listAccountingExportJobs, listAccountingExports, getStoreAccountingIntegration } from "@/lib/phase6/compliance-data";
import { accountingExportStatusLabels, labelFor } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";
import { sendInvoicesToFreeeAction } from "../../compliance/actions";

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default async function AccountingExportsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ freeeSent?: string; freeeFailed?: string }> }) {
  const { storeId } = await params;
  const { freeeSent, freeeFailed } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [invoices, exports, jobs, freee] = await Promise.all([
    listDocuments(store.id, "invoices"),
    listAccountingExports(store.id),
    listAccountingExportJobs(store.id),
    getStoreAccountingIntegration(store.id, "freee")
  ]);
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const freeeConnected = freee?.status === "connected";

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="会計CSV出力"
        description="インボイス対応請求書の売上・税額・入金状態を、会計ソフトへ取り込みやすいCSVで出力します。"
        action={(
          <div className="action-row">
            <Link className="button" href={`/stores/${store.id}/accounting/exports/download`}>汎用CSV</Link>
            <Link className="button secondary" href={`/stores/${store.id}/accounting/exports/download?format=freee`}>freee向けCSV</Link>
            <Link className="button secondary" href={`/stores/${store.id}/accounting/receipts`}>経費レシート</Link>
          </div>
        )}
      />
      <StoreBusinessNav store={store} />
      {freeeSent ? (
        <p className={Number(freeeFailed ?? 0) > 0 ? "notice" : "notice success"}>
          freeeへ{Number(freeeSent).toLocaleString("ja-JP")}件送信しました。
          {Number(freeeFailed ?? 0) > 0 ? ` 送信できなかったデータが${Number(freeeFailed).toLocaleString("ja-JP")}件あります。履歴を確認してください。` : null}
        </p>
      ) : null}
      <section className="grid cols-3">
        <article className="card"><p className="muted">対象請求書</p><div className="metric">{invoices.length.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">請求合計</p><div className="metric">{yen(total)}</div></article>
        <article className="card"><p className="muted">freee接続</p><div className="metric">{freeeConnected ? "接続済み" : "未接続"}</div></article>
      </section>
      <section className="card">
        <h2>freeeへ送信</h2>
        <p>未送信の請求書をfreeeの取引として送信します。入金済みの請求書は、freee設定に口座IDが入っている場合に入金情報も合わせて送ります。</p>
        {!freeeConnected ? <p className="notice">freeeへ送信するには、先にfreee会計設定で事業所を接続してください。</p> : null}
        <div className="action-row">
          <form action={sendInvoicesToFreeeAction.bind(null, store.id)}>
            <PendingSubmitButton pendingLabel="freeeへ送信しています..." disabled={!freeeConnected || invoices.length === 0}>
              請求書・入金をfreeeへ送信
            </PendingSubmitButton>
          </form>
          <Link className="button secondary" href={`/stores/${store.id}/settings/accounting/freee`}>freee送信設定を確認</Link>
        </div>
      </section>
      <section className="card">
        <h2>出力項目</h2>
        <p>取引日、請求書番号、顧客名、摘要、税率、税抜金額、消費税額、税込金額、入金日、支払方法、ステータスを出力します。</p>
        <p>freee向けCSVでは、請求書に加えて外部売上データも確認用の行として含めます。</p>
        <p>仕入れや経費のレシートは、経費レシート画面で読み取り、freeeへ反映する前の確認データとして管理できます。</p>
        <p className="muted">出力したCSVは、会計ソフトへ取り込む前に内容を確認してください。</p>
      </section>
      <section className="card">
        <h2>出力処理履歴</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>連携先</th><th>種類</th><th>状態</th><th>行数</th><th>ファイル名</th></tr></thead>
          <tbody>
            {jobs.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleString("ja-JP")}</td>
                <td>{item.provider === "freee" ? "freee" : item.provider}</td>
                <td>{item.export_type === "csv" ? "CSV" : item.export_type}</td>
                <td><span className="badge">{labelFor(accountingExportStatusLabels, item.status)}</span></td>
                <td>{Number(item.row_count ?? 0).toLocaleString("ja-JP")}</td>
                <td>{item.file_name ?? "-"}</td>
              </tr>
            ))}
            {jobs.length === 0 ? <tr><td colSpan={6}>まだ連携ジョブ履歴はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>CSV出力履歴</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>種類</th><th>行数</th><th>ファイル名</th></tr></thead>
          <tbody>
            {exports.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleString("ja-JP")}</td>
                <td>{item.export_type}</td>
                <td>{item.row_count.toLocaleString("ja-JP")}</td>
                <td>{item.file_name ?? "-"}</td>
              </tr>
            ))}
            {exports.length === 0 ? <tr><td colSpan={4}>まだCSV出力履歴はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
