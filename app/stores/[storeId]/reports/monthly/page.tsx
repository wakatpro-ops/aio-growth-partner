import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getMonthlyReport, normalizeMonth } from "@/lib/phase2/monthly-report";
import { getSalesReport } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";

function formatCurrency(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

export default async function MonthlyReportPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "monthly_report")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const month = normalizeMonth(query.month);
  const [report, salesReport] = await Promise.all([
    getMonthlyReport(store.id, month),
    getSalesReport(store.id)
  ]);
  const documentLabels = {
    estimate: store.industry_type_key === "auto_repair" ? "整備見積" : "見積",
    invoice: store.industry_type_key === "auto_repair" ? "整備請求" : "請求",
    stock: store.industry_type_key === "auto_repair" ? "部品在庫" : "商品在庫",
    customer: store.industry_type_key === "auto_repair" ? "顧客・車両" : "顧客"
  };

  const metrics = [
    { label: `当月の${documentLabels.estimate}金額`, value: formatCurrency(report.estimateTotal) },
    { label: `当月の${documentLabels.invoice}金額`, value: formatCurrency(report.invoiceTotal) },
    { label: "入金済み金額", value: formatCurrency(report.paidTotal) },
    { label: "未入金金額", value: formatCurrency(report.unpaidTotal) },
    { label: `${documentLabels.estimate}件数`, value: `${report.estimateCount.toLocaleString("ja-JP")}件` },
    { label: `${documentLabels.invoice}件数`, value: `${report.invoiceCount.toLocaleString("ja-JP")}件` },
    { label: `${documentLabels.customer}数`, value: `${report.customerCount.toLocaleString("ja-JP")}件` },
    { label: `${documentLabels.stock}注意`, value: `${report.lowStockCount.toLocaleString("ja-JP")}件` }
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="月次レポート"
        description={`${monthLabel(month)}の${documentLabels.estimate}、${documentLabels.invoice}、${documentLabels.stock}を集計します。`}
      />
      <StoreBusinessNav store={store} />
      <form className="card form report-filter">
        <div className="field">
          <label htmlFor="month">対象月</label>
          <input id="month" name="month" type="month" defaultValue={month} />
        </div>
        <button className="button" type="submit">表示</button>
      </form>

      <section className="grid cols-4 report-metrics">
        {metrics.map((metric) => (
          <article className="card" key={metric.label}>
            <p className="muted">{metric.label}</p>
            <div className="metric">{metric.value}</div>
          </article>
        ))}
      </section>

      <section className="card">
        <h3>よく使われる商品・部品</h3>
        <p>明細行が未実装のため、現在は在庫データの数量が多い順で表示します。</p>
        <table className="table compact">
          <thead>
            <tr>
              <th>名称</th>
              <th>種別</th>
              <th>数量</th>
            </tr>
          </thead>
          <tbody>
            {report.frequentItems.map((item) => (
              <tr key={`${item.name}-${item.itemType}`}>
                <td>{item.name}</td>
                <td>{item.itemType ?? "未設定"}</td>
                <td>{item.quantity.toLocaleString("ja-JP")} {item.unit}</td>
              </tr>
            ))}
            {report.frequentItems.length === 0 ? <tr><td colSpan={3}>集計できる商品・部品データがまだありません。</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>外部売上データ</h3>
        <p>CSV / Excelから取り込んだ売上データの接続ポイントです。Phase 4-Aでは簡易集計を表示し、今後AI改善提案へ反映します。</p>
        <div className="grid cols-3">
          <article>
            <p className="muted">外部売上合計</p>
            <div className="metric">{formatCurrency(salesReport.totalSales)}</div>
          </article>
          <article>
            <p className="muted">外部取引件数</p>
            <div className="metric">{salesReport.transactionCount.toLocaleString("ja-JP")}件</div>
          </article>
          <article>
            <p className="muted">平均単価</p>
            <div className="metric">{formatCurrency(salesReport.averageTransactionAmount)}</div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
