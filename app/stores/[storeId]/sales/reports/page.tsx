import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getSalesReport } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function SummaryTable({
  title,
  rows,
  quantity
}: {
  title: string;
  rows: Array<{ label: string; amount: number; count?: number; quantity?: number }>;
  quantity?: boolean;
}) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <table className="table compact">
        <thead><tr><th>項目</th><th>{quantity ? "数量" : "件数"}</th><th>売上</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{quantity ? (row.quantity ?? 0).toLocaleString("ja-JP") : (row.count ?? 0).toLocaleString("ja-JP")}</td>
              <td>{formatCurrency(row.amount)}</td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={3}>集計できる売上データがありません。</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

export default async function SalesReportsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "sales_reports")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const report = await getSalesReport(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="売上レポート"
        description="外部売上データを日別、月別、商品別、支払方法別に集計します。"
        action={(
          <div className="button-row">
            {isFeatureEnabled(flags, "sales_ai_report") ? <Link className="button" href={`/stores/${store.id}/sales/reports/monthly-ai`}>AI月次レポート</Link> : null}
            <Link className="button secondary" href={`/stores/${store.id}/data-imports/new`}>データ取り込み</Link>
          </div>
        )}
      />
      <StoreBusinessNav store={store} />

      <section className="grid cols-3">
        <article className="card">
          <p className="muted">合計売上</p>
          <div className="metric">{formatCurrency(report.totalSales)}</div>
        </article>
        <article className="card">
          <p className="muted">取引件数</p>
          <div className="metric">{report.transactionCount.toLocaleString("ja-JP")}件</div>
        </article>
        <article className="card">
          <p className="muted">平均単価</p>
          <div className="metric">{formatCurrency(report.averageTransactionAmount)}</div>
        </article>
      </section>

      <section className="card">
        <h3>AIコメント</h3>
        <p>Phase 4-Aでは集計までを実装しています。次フェーズで曜日別・時間帯別傾向とAI月次コメントを追加します。</p>
      </section>

      <div className="grid cols-2">
        <SummaryTable title="日別売上" rows={report.daily} />
        <SummaryTable title="月別売上" rows={report.monthly} />
        <SummaryTable title="商品別売上" rows={report.items} quantity />
        <SummaryTable title="支払方法別売上" rows={report.paymentMethods} />
      </div>
    </AppShell>
  );
}
