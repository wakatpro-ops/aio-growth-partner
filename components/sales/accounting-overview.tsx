import Link from "next/link";
import { DonutChart } from "@/components/ui/data-visuals";
import { DataPreview } from "@/components/ui/data-preview";
import type { AccountingOverviewResult } from "@/lib/accounting/overview";

const yen = (value: number) => `${value.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;

export function AccountingOverview({ result, storeId, editable }: { result: AccountingOverviewResult; storeId: string; editable: boolean }) {
  const receipts = `/stores/${storeId}/accounting/receipts`;
  if (result.state === "restricted") return <p className="notice">経理の集計は、店舗オーナー・店長・運営管理者が確認できます。</p>;
  if (result.state === "unavailable") return <p className="notice" role="alert">経費データを取得できませんでした。未登録や0円とは異なります。時間をおいて再読み込みしてください。</p>;
  const { report, undatedCount } = result;
  return <section className="accounting-overview" aria-label="経理の概要">
    <div className="accounting-overview-heading">
      <form className="accounting-month" method="get" action={`/stores/${storeId}/sales-hub`}>
        <input type="hidden" name="tab" value="accounting" />
        <label htmlFor="accounting-month">対象月<input id="accounting-month" name="month" type="month" defaultValue={report.month} required /></label>
        <button className="button secondary" type="submit">表示する</button>
      </form>
      <Link className="text-link" href={receipts}>経費・伝票を確認 →</Link>
    </div>
    <p className="muted accounting-scope">下の経費は{report.month.replace("-", "年")}月の税込金額です。上の売上3指標は登録済みの全期間です。</p>
    {report.pendingCount || report.duplicateCount || report.invalidCount || undatedCount ? <p className="notice accounting-review-note">
      {report.pendingCount ? `内容の確認待ち${report.pendingCount}件を含みます。` : ""}
      {report.duplicateCount ? `重複候補${report.duplicateCount}件は集計していません。` : ""}
      {report.invalidCount ? `金額未確認${report.invalidCount}件は集計していません。` : ""}
      {undatedCount ? `日付未入力${undatedCount}件は月別集計に含みません。` : ""}
      <Link href={receipts}>内容を確認する →</Link>
    </p> : null}
    {report.count ? <div className="accounting-visual-grid">
      <section className="card accounting-details" aria-labelledby="accounting-details-title">
        <div className="section-heading"><h3 id="accounting-details-title">経費の明細</h3><span className="badge">{report.count.toLocaleString("ja-JP")}件</span></div>
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>日付</th><th>項目・支払先</th><th>分類</th><th>金額（税込）</th></tr></thead>
          <tbody>{report.entries.slice(0, 10).map(row => <tr key={row.id}>
            <td>{row.receipt_date?.slice(5).replace("-", "/")}</td>
            <td><Link href={`${receipts}/${row.id}`}>{row.vendor_name || row.category_name || "内容を確認"}</Link>{row.approval_status !== "approved" ? <small className="accounting-pending">確認待ち</small> : null}</td>
            <td><span className="badge">{row.category_name?.trim() || "未分類"}</span></td><td className="accounting-amount">{yen(row.amount)}</td>
          </tr>)}</tbody>
        </table></div>
        <ul className="accounting-mobile-entries">{report.entries.slice(0, 10).map(row => <li key={row.id}>
          <div className="accounting-mobile-entry-heading"><time dateTime={row.receipt_date ?? undefined}>{row.receipt_date?.slice(5).replace("-", "/")}</time><strong>{yen(row.amount)}</strong></div>
          <Link href={`${receipts}/${row.id}`}>{row.vendor_name || row.category_name || "内容を確認"}</Link>
          <div><span className="badge">{row.category_name?.trim() || "未分類"}</span>{row.approval_status !== "approved" ? <small className="accounting-pending">確認待ち</small> : null}</div>
        </li>)}</ul>
        {report.count > 10 ? <Link className="text-link" href={receipts}>経費・伝票一覧で続きを見る →</Link> : null}
      </section>
      <div className="accounting-composition">
        {report.hasNegative ? <section className="visual-card"><h3>月次経費内訳</h3><p className="muted">返金・調整のマイナス金額を含むため、円グラフではなく金額で表示しています。</p><dl className="accounting-category-list">{report.breakdown.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{yen(row.amount)}</dd></div>)}</dl><p>合計（税込） <strong>{yen(report.total)}</strong></p></section>
          : <DonutChart title="月次経費内訳" centerLabel="経費合計・税込" centerValue={yen(report.total)} data={report.chart.map(row => ({ label: row.label, value: row.amount, displayValue: yen(row.amount) }))} emptyMessage="経費の合計が0円のため、割合は表示していません。" />}
      </div>
    </div> : <DataPreview kind="donut" title="経費を取り込むと、使い道がひと目で分かります" description="レシートやCSV・Excelの経費データから、分類ごとの内訳と明細をまとめて確認できます。" importHref={editable ? `/stores/${storeId}/data-imports/ai` : undefined} />}
  </section>;
}
