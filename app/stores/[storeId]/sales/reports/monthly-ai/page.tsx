import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listSalesAiReports } from "@/lib/phase4/sales-ai-report";
import { getStore } from "@/lib/stores";
import { generateSalesAiReportAction } from "./actions";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default async function SalesAiReportsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeId } = await params;
  const { error } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "sales_ai_report")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const reports = await listSalesAiReports(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="AI月次売上レポート"
        description="取り込んだ外部売上データから、月次分析、注意点、来月の改善アクションを作成します。"
        action={<Link className="button secondary" href={`/stores/${store.id}/sales/reports`}>売上レポート</Link>}
      />
      <StoreBusinessNav store={store} />

      {error ? <p className="notice error">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <h3>AI月次レポートを生成</h3>
        <form action={generateSalesAiReportAction.bind(null, store.id)} className="form-grid">
          <label>
            対象月
            <input name="target_month" type="month" defaultValue={currentMonth()} required />
          </label>
          <div className="form-actions">
            <button className="button" type="submit">AIレポート生成</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3>生成済みレポート</h3>
        <table className="table">
          <thead>
            <tr><th>対象月</th><th>タイトル</th><th>売上</th><th>取引件数</th><th>作成日</th><th /></tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>{report.target_month}</td>
                <td>{report.title}</td>
                <td>{formatCurrency(report.summary_metrics.totalSales)}</td>
                <td>{report.summary_metrics.transactionCount.toLocaleString("ja-JP")}件</td>
                <td>{new Date(report.created_at).toLocaleDateString("ja-JP")}</td>
                <td><Link className="button secondary" href={`/stores/${store.id}/sales/reports/monthly-ai/${report.id}`}>詳細</Link></td>
              </tr>
            ))}
            {reports.length === 0 ? <tr><td colSpan={6}>まだAI月次レポートがありません。対象月を選んで生成してください。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
