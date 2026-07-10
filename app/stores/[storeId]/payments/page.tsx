import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listDocuments } from "@/lib/phase2/business-data";
import { listPayments } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { createPaymentAction } from "../compliance/actions";

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

const methodLabels: Record<string, string> = {
  cash: "現金",
  credit_card: "クレジットカード",
  qr_payment: "QR決済",
  bank_transfer: "銀行振込",
  other: "その他"
};

export default async function PaymentsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [payments, invoices] = await Promise.all([
    listPayments(store.id),
    listDocuments(store.id, "invoices")
  ]);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="入金管理" description="請求済み、未入金、一部入金、入金済みを確認します。" />
      <StoreBusinessNav store={store} />

      <section className="grid cols-3">
        <article className="card"><p className="muted">入金記録</p><div className="metric">{payments.length.toLocaleString("ja-JP")}件</div></article>
        <article className="card"><p className="muted">入金合計</p><div className="metric">{yen(payments.reduce((sum, payment) => sum + payment.amount, 0))}</div></article>
        <article className="card"><p className="muted">未入金請求</p><div className="metric">{invoices.filter((invoice) => invoice.payment_status !== "paid").length.toLocaleString("ja-JP")}件</div></article>
      </section>

      <section className="card form">
        <h2>入金を記録</h2>
        <form action={createPaymentAction.bind(null, store.id)} className="grid cols-2">
          <div className="field">
            <label htmlFor="invoice_id">対象請求書</label>
            <select id="invoice_id" name="invoice_id">
              <option value="">未選択</option>
              {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.document_number} / {invoice.title} / {yen(invoice.total)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="amount">入金額</label>
            <input id="amount" name="amount" type="number" min="0" step="1" required />
          </div>
          <div className="field">
            <label htmlFor="payment_date">入金日</label>
            <input id="payment_date" name="payment_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="payment_method">支払方法</label>
            <select id="payment_method" name="payment_method" defaultValue="bank_transfer">
              <option value="cash">現金</option>
              <option value="credit_card">クレジットカード</option>
              <option value="qr_payment">QR決済</option>
              <option value="bank_transfer">銀行振込</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">状態</label>
            <select id="status" name="status" defaultValue="received">
              <option value="received">入金済み</option>
              <option value="partial">一部入金</option>
              <option value="cancelled">取消</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="external_provider">外部決済</label>
            <select id="external_provider" name="external_provider" defaultValue="">
              <option value="">なし</option>
              <option value="stripe">Stripe</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="external_payment_id">外部決済ID</label>
            <input id="external_payment_id" name="external_payment_id" placeholder="pi_... / cs_... / 手動ID" />
          </div>
          <div className="field full-span">
            <label htmlFor="external_payment_url">外部決済URL</label>
            <input id="external_payment_url" name="external_payment_url" placeholder="https://..." />
          </div>
          <div className="field">
            <label htmlFor="memo">メモ</label>
            <input id="memo" name="memo" />
          </div>
          <button className="button" type="submit">保存</button>
        </form>
      </section>

      <section className="card">
        <h2>入金履歴</h2>
        <table className="table">
          <thead><tr><th>入金日</th><th>請求書</th><th>金額</th><th>方法</th><th>外部決済</th><th>状態</th><th>メモ</th></tr></thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.payment_date}</td>
                <td>{payment.invoice?.document_number ?? "-"}</td>
                <td>{yen(payment.amount)}</td>
                <td>{methodLabels[payment.payment_method] ?? payment.payment_method}</td>
                <td>{payment.external_provider ? `${payment.external_provider} / ${payment.external_payment_id ?? "-"}` : "-"}</td>
                <td><span className="badge">{payment.status}</span></td>
                <td>{payment.memo ?? "-"}</td>
              </tr>
            ))}
            {payments.length === 0 ? <tr><td colSpan={7}>まだ入金記録はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
