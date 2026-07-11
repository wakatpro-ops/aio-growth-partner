import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listSalesTransactions } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";

function formatCurrency(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

export default async function SalesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "sales_reports")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const transactions = await listSalesTransactions(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="売上データ"
        description="CSV / Excelから取り込んだ外部売上データを表示します。"
        action={<Link className="button" href={`/stores/${store.id}/sales/reports`}>売上レポート</Link>}
      />
      <StoreBusinessNav store={store} />
      <p className="notice success">
        {transactions.length > 0
          ? "売上データが入ったため、AI月次レポート、需要予測、販促アクションの提案が具体化します。"
          : "売上データを取り込むと、月次レポートと改善提案が数字に基づいて具体化します。"}
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>売上日</th>
              <th>商品名</th>
              <th>数量</th>
              <th>合計金額</th>
              <th>支払方法</th>
              <th>取り込み元</th>
              <th>取り込み日時</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => {
              const item = transaction.items?.[0];
              return (
                <tr key={transaction.id}>
                  <td>{new Date(transaction.business_date).toLocaleDateString("ja-JP")}</td>
                  <td>{item?.item_name ?? "-"}</td>
                  <td>{item?.quantity ?? "-"}</td>
                  <td>{formatCurrency(transaction.gross_amount)}</td>
                  <td>{transaction.payment_method ?? "-"}</td>
                  <td>{transaction.data_source?.name ?? "-"}</td>
                  <td>{new Date(transaction.created_at).toLocaleString("ja-JP")}</td>
                </tr>
              );
            })}
            {transactions.length === 0 ? <tr><td colSpan={7}>まだ売上データがありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
