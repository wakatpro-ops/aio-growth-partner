import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getOrder, listOrderStatusLogs } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { createInvoiceFromOrderAction, updateOrderAction } from "../../compliance/actions";

function yen(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

export default async function OrderDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; orderId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { storeId, orderId } = await params;
  const { saved } = await searchParams;
  const store = await getStore(storeId);
  const [order, logs] = await Promise.all([
    getOrder(store.id, orderId),
    listOrderStatusLogs(store.id, orderId)
  ]);
  if (!order) notFound();
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={order.title}
        description="受注ステータス、作業ステータス、請求化、ステータス履歴を管理します。"
        action={(
          <div className="button-row">
            {order.invoice_id ? <Link className="button" href={`/stores/${store.id}/invoices/${order.invoice_id}`}>請求書を見る</Link> : (
              <form action={createInvoiceFromOrderAction.bind(null, store.id, order.id)}>
                <button className="button" type="submit">請求書を作成</button>
              </form>
            )}
            <Link className="button secondary" href={`/stores/${store.id}/orders`}>一覧へ戻る</Link>
          </div>
        )}
      />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">受注を保存しました。</p> : null}

      <section className="grid cols-3">
        <article className="card"><p className="muted">受注番号</p><strong>{order.order_number}</strong></article>
        <article className="card"><p className="muted">受注金額</p><strong>{yen(order.total)}</strong></article>
        <article className="card"><p className="muted">元見積</p><strong>{order.estimate?.document_number ?? "未設定"}</strong></article>
      </section>

      <section className="card form">
        <h2>受注情報</h2>
        <form action={updateOrderAction.bind(null, store.id, order.id)} className="grid cols-2">
          <div className="field">
            <label htmlFor="title">件名</label>
            <input id="title" name="title" defaultValue={order.title} required />
          </div>
          <div className="field">
            <label htmlFor="total">金額</label>
            <input id="total" name="total" type="number" min="0" step="1" defaultValue={order.total} />
          </div>
          <div className="field">
            <label htmlFor="status">受注ステータス</label>
            <select id="status" name="status" defaultValue={order.status}>
              <option value="ordered">受注</option>
              <option value="in_progress">作業中</option>
              <option value="completed">作業完了</option>
              <option value="invoiced">請求化済み</option>
              <option value="cancelled">取消</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="work_status">作業ステータス</label>
            <select id="work_status" name="work_status" defaultValue={order.work_status ?? "not_started"}>
              <option value="not_started">未着手</option>
              <option value="working">作業中</option>
              <option value="done">作業完了</option>
              <option value="on_hold">保留</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ordered_at">受注日</label>
            <input id="ordered_at" name="ordered_at" type="date" defaultValue={order.ordered_at ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="completed_at">作業完了日</label>
            <input id="completed_at" name="completed_at" type="date" defaultValue={order.completed_at ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="status_comment">ステータス変更メモ</label>
            <input id="status_comment" name="status_comment" placeholder="例: 作業完了を確認" />
          </div>
          <div className="field">
            <label htmlFor="notes">メモ</label>
            <input id="notes" name="notes" defaultValue={order.notes ?? ""} />
          </div>
          <button className="button" type="submit">保存</button>
        </form>
      </section>

      <section className="card">
        <h2>ステータス履歴</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>変更前</th><th>変更後</th><th>メモ</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{dateTime(log.created_at)}</td>
                <td>{log.from_status ?? "-"}</td>
                <td><span className="badge">{log.to_status}</span></td>
                <td>{log.comment ?? "-"}</td>
              </tr>
            ))}
            {logs.length === 0 ? <tr><td colSpan={4}>まだ履歴はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
