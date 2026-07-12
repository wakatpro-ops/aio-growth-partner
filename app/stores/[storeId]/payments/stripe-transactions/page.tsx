import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listStripePaymentTransactions } from "@/lib/phase6/compliance-data";
import { labelFor, paymentRecordStatusLabels } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default async function StripeTransactionsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const transactions = await listStripePaymentTransactions(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Stripe外部決済履歴" description="登録したStripe決済URLや、入金状況を確認するための履歴です。" />
      <StoreBusinessNav store={store} />
      <section className="card">
        <table className="table">
          <thead><tr><th>日時</th><th>請求書</th><th>外部ID</th><th>金額</th><th>状態</th></tr></thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{new Date(transaction.created_at).toLocaleString("ja-JP")}</td>
                <td>{transaction.invoice?.document_number ?? "-"}</td>
                <td>{transaction.external_payment_intent_id ?? "-"}</td>
                <td>{yen(Number(transaction.amount ?? 0))}</td>
                <td><span className="badge">{labelFor(paymentRecordStatusLabels, transaction.status)}</span></td>
              </tr>
            ))}
            {transactions.length === 0 ? <tr><td colSpan={5}>まだStripe外部決済履歴はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
