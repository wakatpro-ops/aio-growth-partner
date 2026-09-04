import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { DonutChart, HorizontalBarChart } from "@/components/ui/data-visuals";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getSalesReport } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function paymentLabel(value: string) {
  return ({ cash: "現金", credit_card: "クレジットカード", qr_payment: "QR決済", bank_transfer: "銀行振込", other: "その他", unset: "未設定", 未設定: "未設定" } as Record<string, string>)[value] ?? value;
}

function formatAxisCurrency(value: number) {
  if (value >= 10000) {
    const amount = value / 10000;
    return `${Number.isInteger(amount) ? amount : amount.toFixed(1)}万`;
  }
  return Math.round(value).toLocaleString("ja-JP");
}

function monthLabel(value: string) {
  const month = Number(value.slice(5, 7));
  return Number.isFinite(month) && month > 0 ? `${month}月` : value;
}

function niceStep(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function SalesTrendChart({ rows }: { rows: Array<{ label: string; amount: number; count?: number }> }) {
  const points = rows.slice(-12);
  if (points.length === 0) {
    return <section className="card sales-trend-card"><h3>月別売上推移</h3><p className="muted">売上データを取り込むと、月ごとの推移を折れ線グラフで確認できます。</p></section>;
  }

  const width = 900;
  const height = 280;
  const padding = { top: 28, right: 22, bottom: 46, left: 68 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const step = niceStep(Math.max(...points.map((point) => point.amount)) / 4);
  const maxValue = Math.max(step * 4, 1);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? padding.left + chartWidth / 2 : padding.left + index / (points.length - 1) * chartWidth,
    y: padding.top + chartHeight - point.amount / maxValue * chartHeight
  }));
  const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${coordinates.at(-1)?.x.toFixed(1)} ${padding.top + chartHeight} L ${coordinates[0]?.x.toFixed(1)} ${padding.top + chartHeight} Z`;
  const current = points.at(-1)!;
  const previous = points.at(-2);
  const changeRate = previous && previous.amount !== 0 ? (current.amount - previous.amount) / previous.amount * 100 : null;
  const peak = points.reduce((best, point) => point.amount > best.amount ? point : best, points[0]);

  return (
    <section className="card sales-trend-card" aria-labelledby="sales-trend-title">
      <div className="sales-trend-heading">
        <div><p className="eyebrow">直近{points.length}か月</p><h3 id="sales-trend-title">月別売上推移</h3></div>
        <div className="sales-trend-facts">
          <span><small>最新月</small><strong>{formatCurrency(current.amount)}</strong></span>
          <span><small>前月比</small><strong className={changeRate === null ? "neutral" : changeRate >= 0 ? "positive" : "negative"}>{changeRate === null ? "比較なし" : `${changeRate >= 0 ? "+" : ""}${changeRate.toFixed(1)}%`}</strong></span>
          <span><small>最高売上月</small><strong>{monthLabel(peak.label)}・{formatCurrency(peak.amount)}</strong></span>
        </div>
      </div>
      <div className="sales-trend-scroll">
        <svg className="sales-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${points[0].label}から${current.label}までの月別売上推移`}>
          <defs>
            <linearGradient id="sales-trend-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#248565" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#248565" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((index) => {
            const value = maxValue - index * step;
            const y = padding.top + index / 4 * chartHeight;
            return <g key={value}><line className="sales-trend-gridline" x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text className="sales-trend-axis-label" x={padding.left - 12} y={y + 4} textAnchor="end">{formatAxisCurrency(value)}</text></g>;
          })}
          <path className="sales-trend-area" d={areaPath} />
          <path className="sales-trend-line" d={linePath} />
          {coordinates.map((point) => (
            <g key={point.label}>
              <circle className="sales-trend-point-halo" cx={point.x} cy={point.y} r="8" />
              <circle className="sales-trend-point" cx={point.x} cy={point.y} r="4"><title>{point.label}: {formatCurrency(point.amount)}（{point.count ?? 0}件）</title></circle>
              <text className="sales-trend-month-label" x={point.x} y={height - 16} textAnchor="middle">{monthLabel(point.label)}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="sales-trend-note">取り込んだ売上データを月単位で集計しています。各点にカーソルを合わせると金額と件数を確認できます。</p>
    </section>
  );
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
    { title: "経費・会計", body: "伝票の読み取りから内容確認、会計ソフト用データの出力までをまとめます。", links: [
      ["経費・伝票を確認", `/stores/${store.id}/accounting/receipts`],
      ["伝票をAIで読み取る", `/stores/${store.id}/accounting/receipts/new`],
      ["会計データを書き出す", `/stores/${store.id}/accounting/exports`],
      ["freee連携を確認", `/stores/${store.id}/settings/accounting/freee`]
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
        title="売上・経理"
        description="売上、見積・請求・入金、経費・伝票、会計用データを一つの入口から確認できます。"
        action={<Link className="button" href={`/stores/${store.id}/data-imports/ai`}>売上・経費データを取り込む</Link>}
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
          <SalesTrendChart rows={report.monthly} />
          <div className="visual-grid cols-2">
            <HorizontalBarChart
              title="売上上位の商品・メニュー"
              data={report.items.map((item) => ({ label: item.label, value: item.amount, displayValue: formatCurrency(item.amount), detail: `${(item.quantity ?? 0).toLocaleString("ja-JP")}件` }))}
              emptyMessage="商品・メニュー別に分類できる売上データがありません。"
            />
            <DonutChart
              title="支払方法の割合"
              centerLabel="売上合計"
              centerValue={formatCurrency(report.totalSales)}
              data={report.paymentMethods.map((item) => ({ label: paymentLabel(item.label), value: item.amount, displayValue: formatCurrency(item.amount) }))}
              emptyMessage="支払方法を判別できる売上データがありません。"
            />
          </div>
          <p className="visual-guidance">グラフは取り込んだ実データだけを表示しています。未設定が多い場合は、次回の取り込みで支払方法の列を指定すると内訳が分かりやすくなります。</p>
        </section>
      ) : <p className="notice">この店舗では売上レポートを利用しない設定です。見積・請求・領収など、利用中の機能は下から開けます。</p>}

      <section className="sales-hub-actions">
        <div className="section-heading"><div><p className="eyebrow">売上・経理の操作</p><h2>作成・確認する</h2></div></div>
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
