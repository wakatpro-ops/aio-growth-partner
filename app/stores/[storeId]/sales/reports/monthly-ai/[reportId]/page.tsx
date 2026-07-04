import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ReportPrintButton } from "@/components/phase4/report-print-button";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getSalesAiReport } from "@/lib/phase4/sales-ai-report";
import { getStore } from "@/lib/stores";

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function formatRate(value: number | null) {
  if (value === null) return "前月データなし";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function ListSection({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <ul className="stack-list">
        {rows.map((row) => <li key={row}>{row}</li>)}
        {rows.length === 0 ? <li>表示できる内容がありません。</li> : null}
      </ul>
    </section>
  );
}

function RankingTable({
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
          {rows.length === 0 ? <tr><td colSpan={3}>集計できるデータがありません。</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}

export default async function SalesAiReportDetailPage({ params }: { params: Promise<{ storeId: string; reportId: string }> }) {
  const { storeId, reportId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "sales_ai_report")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const detail = await getSalesAiReport(store.id, reportId);
  if (!detail) notFound();
  const report = detail.report;
  const summary = report.summary_metrics;
  const ai = report.ai_result;

  return (
    <AppShell>
      <div className="print-actions">
        <Link className="button secondary" href={`/stores/${store.id}/sales/reports/monthly-ai`}>一覧へ戻る</Link>
        {isFeatureEnabled(flags, "sales_report_pdf") ? <ReportPrintButton /> : null}
      </div>
      <PageHeader
        eyebrow={`${industry.name} / ${report.target_month}`}
        title={report.title}
        description="売上サマリー、ランキング、注意点、AI改善提案をまとめた月次資料です。"
      />
      <StoreBusinessNav store={store} />

      <main className="print-sheet">
        <section className="print-header">
          <div>
            <p className="print-eyebrow">{industry.name}</p>
            <h1>{report.title}</h1>
          </div>
          <div className="print-store">
            <strong>{store.name}</strong>
            <span>{store.address}</span>
            <span>{store.phone}</span>
          </div>
        </section>

        <section className="grid cols-4">
          <article className="card">
            <p className="muted">対象月売上</p>
            <div className="metric">{formatCurrency(summary.totalSales)}</div>
          </article>
          <article className="card">
            <p className="muted">前月比</p>
            <div className="metric">{formatRate(summary.monthOverMonthRate)}</div>
          </article>
          <article className="card">
            <p className="muted">取引件数</p>
            <div className="metric">{summary.transactionCount.toLocaleString("ja-JP")}件</div>
          </article>
          <article className="card">
            <p className="muted">平均客単価</p>
            <div className="metric">{formatCurrency(summary.averageTransactionAmount)}</div>
          </article>
        </section>

        <section className="card">
          <h3>AIコメント</h3>
          <p>{ai.ai_reasoning}</p>
        </section>

        <div className="grid cols-2">
          <ListSection title="今月の良かった点" rows={ai.good_points} />
          <ListSection title="注意すべき点" rows={ai.cautions} />
          <ListSection title="来月伸ばすべき商品・サービス" rows={ai.growth_items} />
          <ListSection title="投稿や販促に使えるネタ" rows={ai.promotion_ideas} />
          <ListSection title="在庫や仕入れで注意すべき点" rows={ai.inventory_notes} />
          <ListSection title="来月のアクション" rows={ai.next_actions} />
        </div>

        <ListSection title="業態別の改善提案" rows={ai.industry_advice} />

        <div className="grid cols-2">
          <RankingTable title="商品・サービス別ランキング" rows={summary.topItems} quantity />
          <RankingTable title="支払方法別集計" rows={summary.paymentMethods} />
          <RankingTable title="日別売上" rows={summary.daily} />
          <RankingTable title="曜日別売上" rows={summary.weekday} />
        </div>

        <section className="card">
          <h3>異常値・確認ポイント</h3>
          <table className="table compact">
            <thead><tr><th>重要度</th><th>種類</th><th>内容</th></tr></thead>
            <tbody>
              {detail.flags.map((flag, index) => (
                <tr key={`${flag.anomaly_type}-${index}`}>
                  <td>{flag.severity}</td>
                  <td>{flag.title}</td>
                  <td>{flag.description}</td>
                </tr>
              ))}
              {detail.flags.length === 0 ? <tr><td colSpan={3}>大きな注意点は検出されていません。</td></tr> : null}
            </tbody>
          </table>
        </section>
      </main>
    </AppShell>
  );
}
