import Link from "next/link";
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
    <section className="card sales-summary-card">
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

export default async function SalesHubPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);
  const salesReportsEnabled = isFeatureEnabled(flags, "sales_reports");
  const salesAiReportEnabled = isFeatureEnabled(flags, "sales_ai_report");
  const report = salesReportsEnabled ? await getSalesReport(store.id) : null;
  const groups = [
    { title: "書類・入金", body: "見積から請求、領収・入金確認までをまとめて進めます。", links: [
      [industry.businessLabels.estimate, `/stores/${store.id}/estimates`],
      [industry.businessLabels.invoice, `/stores/${store.id}/invoices`],
      ["領収・入金記録", `/stores/${store.id}/payments`]
    ] },
    { title: "売上データ", body: "取り込んだ取引明細と、売上データの追加・更新を確認します。", links: [
      ["取引明細を見る", `/stores/${store.id}/sales`],
      ["売上データを取り込む", `/stores/${store.id}/data-imports/ai`],
      ["需要予測を見る", `/stores/${store.id}/sales/forecast`]
    ] },
    { title: "分析", body: "月次の傾向と、AIによる注意点・次の打ち手を確認します。", links: [
      ["月次レポート", `/stores/${store.id}/reports/monthly`],
      ...(salesAiReportEnabled ? [["AI月次売上レポート", `/stores/${store.id}/sales/reports/monthly-ai`]] : [])
    ] },
    { title: "売上の基本情報", body: "書類・売上データで使う商品・サービスと顧客を管理します。", links: [
      [industry.businessLabels.item, `/stores/${store.id}/items`],
      [industry.businessLabels.customer, `/stores/${store.id}/customers`]
    ] }
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="売上・レポート"
        description="売上状況、取引明細、見積・請求・領収、AI分析をこの画面から確認できます。"
        action={<Link className="button" href={`/stores/${store.id}/data-imports/ai`}>売上データを取り込む</Link>}
      />
      <StoreBusinessNav store={store} />

      {report ? (
        <section className="sales-overview" id="overview">
          <div className="section-heading"><div><p className="eyebrow">現在の売上</p><h2>売上概要</h2></div><Link className="text-link" href={`/stores/${store.id}/sales`}>取引明細を見る →</Link></div>
          <div className="grid cols-3 sales-kpi-grid">
            <article className="card"><p className="muted">合計売上</p><div className="metric">{formatCurrency(report.totalSales)}</div></article>
            <article className="card"><p className="muted">取引件数</p><div className="metric">{report.transactionCount.toLocaleString("ja-JP")}件</div></article>
            <article className="card"><p className="muted">平均取引額</p><div className="metric">{formatCurrency(report.averageTransactionAmount)}</div><small>顧客単位の客単価とは区別しています</small></article>
          </div>
        </section>
      ) : <p className="notice">この店舗では売上レポートを利用しない設定です。見積・請求・領収など、利用中の機能は下から開けます。</p>}

      <section className="sales-hub-actions">
        <div className="section-heading"><div><p className="eyebrow">売上の操作</p><h2>作成・確認する</h2></div></div>
        <div className="hub-grid">
          {groups.map((group) => (
            <article className="static-card" key={group.title}>
              <h3>{group.title}</h3><p>{group.body}</p>
              <div className="stacked-links">
                {group.links.map(([label, href]) => <Link href={href} key={href}><span>{label}</span><b>開く →</b></Link>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      {report ? (
        <section className="sales-report-section" id="reports">
          <div className="section-heading">
            <div><p className="eyebrow">実データの集計</p><h2>売上レポート</h2></div>
            {salesAiReportEnabled ? <Link className="button secondary" href={`/stores/${store.id}/sales/reports/monthly-ai`}>AI月次レポート</Link> : null}
          </div>
          <p className="sales-report-description">取り込んだ売上データを日別、月別、商品別、支払方法別に集計しています。</p>
          <div className="grid cols-2 sales-report-grid">
            <SummaryTable title="日別売上" rows={report.daily} />
            <SummaryTable title="月別売上" rows={report.monthly} />
            <SummaryTable title="商品別売上" rows={report.items} quantity />
            <SummaryTable title="支払方法別売上" rows={report.paymentMethods} />
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
