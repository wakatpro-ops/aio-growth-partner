import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listDocuments } from "@/lib/phase2/business-data";
import { listAccountingExports } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default async function AccountingExportsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [invoices, exports] = await Promise.all([
    listDocuments(store.id, "invoices"),
    listAccountingExports(store.id)
  ]);
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="会計CSV出力"
        description="インボイス対応請求書の売上・税額・入金状態をCSVで出力します。freee、マネーフォワード連携の前段として使える形式です。"
        action={<Link className="button" href={`/stores/${store.id}/accounting/exports/download`}>CSVダウンロード</Link>}
      />
      <StoreBusinessNav store={store} />
      <section className="grid cols-3">
        <article className="card"><p className="muted">対象請求書</p><div className="metric">{invoices.length.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">請求合計</p><div className="metric">{yen(total)}</div></article>
        <article className="card"><p className="muted">出力形式</p><div className="metric">CSV</div></article>
      </section>
      <section className="card">
        <h2>出力項目</h2>
        <p>発行日、取引年月日、請求書番号、顧客名、税率別内訳、小計、消費税、合計、入金状態、支払方法を出力します。</p>
        <p className="muted">補助金採択やITツール登録を保証するものではありません。会計・受発注・決済を説明しやすくするための機能整理です。</p>
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
