import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listCustomers, listDocuments } from "@/lib/phase2/business-data";
import { listOrders } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import Link from "next/link";
import { createOrderAction } from "../compliance/actions";

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export default async function OrdersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [orders, estimates, customers] = await Promise.all([
    listOrders(store.id),
    listDocuments(store.id, "estimates"),
    listCustomers(store.id)
  ]);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="受注・作業管理" description="見積から受注、作業完了、請求化までの状態を管理します。" />
      <StoreBusinessNav store={store} />

      <section className="card form">
        <h2>受注を追加</h2>
        <form action={createOrderAction.bind(null, store.id)} className="grid cols-2">
          <div className="field">
            <label htmlFor="order_number">受注番号</label>
            <input id="order_number" name="order_number" placeholder="空欄なら自動的な番号を利用" />
          </div>
          <div className="field">
            <label htmlFor="title">件名</label>
            <input id="title" name="title" required />
          </div>
          <div className="field">
            <label htmlFor="estimate_id">元見積</label>
            <select id="estimate_id" name="estimate_id">
              <option value="">未選択</option>
              {estimates.map((estimate) => <option key={estimate.id} value={estimate.id}>{estimate.document_number} / {estimate.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="customer_id">顧客</label>
            <select id="customer_id" name="customer_id">
              <option value="">未選択</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">状態</label>
            <select id="status" name="status" defaultValue="ordered">
              <option value="ordered">受注</option>
              <option value="in_progress">作業中</option>
              <option value="completed">作業完了</option>
              <option value="invoiced">請求化済み</option>
              <option value="cancelled">取消</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="work_status">作業状態</label>
            <select id="work_status" name="work_status" defaultValue="not_started">
              <option value="not_started">未着手</option>
              <option value="working">作業中</option>
              <option value="done">作業完了</option>
              <option value="on_hold">保留</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="total">金額</label>
            <input id="total" name="total" type="number" min="0" step="1" defaultValue="0" />
          </div>
          <div className="field">
            <label htmlFor="ordered_at">受注日</label>
            <input id="ordered_at" name="ordered_at" type="date" />
          </div>
          <div className="field">
            <label htmlFor="completed_at">作業完了日</label>
            <input id="completed_at" name="completed_at" type="date" />
          </div>
          <div className="field full-width">
            <label htmlFor="notes">メモ</label>
            <textarea id="notes" name="notes" />
          </div>
          <button className="button" type="submit">保存</button>
        </form>
      </section>

      <section className="card">
        <h2>受注一覧</h2>
        <table className="table">
          <thead><tr><th>番号</th><th>件名</th><th>顧客</th><th>状態</th><th>作業</th><th>金額</th><th>操作</th></tr></thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.order_number}</td>
                <td>{order.title}</td>
                <td>{order.customer?.name ?? "未選択"}</td>
                <td><span className="badge">{order.status}</span></td>
                <td><span className="badge">{order.work_status ?? "not_started"}</span></td>
                <td>{yen(order.total)}</td>
                <td><Link className="button secondary" href={`/stores/${store.id}/orders/${order.id}`}>詳細</Link></td>
              </tr>
            ))}
            {orders.length === 0 ? <tr><td colSpan={7}>まだ受注はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
