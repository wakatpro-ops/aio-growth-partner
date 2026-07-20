import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getSubsidyImpactReport } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";

export default async function SubsidyImpactPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const report = await getSubsidyImpactReport(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="導入効果レポート" description="電子化・データ化・AI活用の件数を整理し、業務改善の振り返りに使いやすい形で表示します。" />
      <StoreBusinessNav store={store} />
      <section className="grid cols-3">
        <article className="card"><p className="muted">電子化した請求書</p><div className="metric">{report.invoiceCount.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">売上管理件数</p><div className="metric">{report.salesCount.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">入金管理件数</p><div className="metric">{report.paymentCount.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">CSV出力件数</p><div className="metric">{(report.exportCount ?? 0).toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">AI提案件数</p><div className="metric">{report.aiCount.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">Google/Gmail/Calendar支援</p><div className="metric">{(report.googleSupportCount ?? 0).toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">PDF発行件数</p><div className="metric">{report.pdfCount.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">手作業削減見込み</p><div className="metric">{report.estimatedMinutesSaved.toLocaleString("ja-JP")}分</div></article>
      </section>
      <section className="card">
        <h2>説明上の位置づけ</h2>
        <p>AIO boostで請求、入金、売上データ、AI提案、外部連携支援をどの程度使っているかを整理するための画面です。</p>
        <p className="muted">補助金や制度利用の判断が必要な場合は、専門家や窓口へ確認してください。</p>
      </section>
    </AppShell>
  );
}
