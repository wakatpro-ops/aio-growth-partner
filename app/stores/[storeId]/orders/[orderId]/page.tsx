import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { listArchivedOrderItems, listOrderItems } from "@/lib/inventory-operations";
import { listBusinessItems } from "@/lib/phase2/business-data";
import { getOrder, listOrderStatusLogs } from "@/lib/phase6/compliance-data";
import { labelFor, orderStatusLabels } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";
import { addOrderItemAction, archiveOrderItemAction, createInvoiceFromOrderAction, restoreOrderItemAction, updateOrderAction } from "../../compliance/actions";

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
  searchParams: Promise<{ saved?: string; error?: string; itemSaved?: string; itemDeleted?: string; itemRestored?: string }>;
}) {
  const { storeId, orderId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const [order, logs, orderItems, archivedItems, items] = await Promise.all([
    getOrder(store.id, orderId),
    listOrderStatusLogs(store.id, orderId),
    listOrderItems(store.id, orderId),
    listArchivedOrderItems(store.id, orderId),
    listBusinessItems(store.id, 200)
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
      {query.saved ? <p className="notice success">受注を保存しました。</p> : null}
      {query.itemSaved ? <p className="notice success">受注明細を追加し、在庫を引き当てました。</p> : null}
      {query.itemDeleted ? <p className="notice success">明細を削除しました。在庫引当は解除されています。</p> : null}
      {query.itemRestored ? <p className="notice success">明細を元に戻し、在庫を再び引き当てました。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

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
            <input id="total" name="total" type="number" min="0" step="1" defaultValue={order.total} readOnly={orderItems.length > 0} />
            {orderItems.length > 0 ? <span className="muted">受注明細の合計から自動計算されます。</span> : null}
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
        <h2>受注明細と在庫連動</h2>
        <p className="muted">在庫管理対象の商品は、受注・作業中で引当、作業完了・請求化で在庫から減算、取消で自動的に戻します。</p>
        <table className="table">
          <thead><tr><th>商品・内容</th><th>数量</th><th>単価</th><th>金額</th><th>在庫</th><th>操作</th></tr></thead>
          <tbody>
            {orderItems.map((line) => (
              <tr key={line.id}>
                <td>{line.description}{line.item?.sku ? <small className="muted">（{line.item.sku}）</small> : null}</td>
                <td>{line.quantity}{line.unit}</td>
                <td>{yen(line.unit_price)}</td>
                <td>{yen(line.amount)}</td>
                <td>{line.item?.is_stock_managed ? <span className="badge">自動連動</span> : "対象外"}</td>
                <td>
                  {!(["completed", "invoiced"] as string[]).includes(order.status) ? (
                    <form action={archiveOrderItemAction.bind(null, store.id, order.id, line.id)}>
                      <ConfirmSubmitButton message="この明細を削除しますか？在庫引当も解除されます。">削除</ConfirmSubmitButton>
                    </form>
                  ) : "-"}
                </td>
              </tr>
            ))}
            {orderItems.length === 0 ? <tr><td colSpan={6}>明細はまだありません。</td></tr> : null}
          </tbody>
        </table>

        {!(["completed", "invoiced", "cancelled"] as string[]).includes(order.status) ? (
          <form action={addOrderItemAction.bind(null, store.id, order.id)} className="form">
            <h3>明細を追加</h3>
            <div className="grid cols-3">
              <div className="field">
                <label htmlFor="item_id">登録済み商品・メニュー</label>
                <select id="item_id" name="item_id" defaultValue="">
                  <option value="">自由入力する</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? `（${item.sku}）` : ""}{item.is_stock_managed ? "・在庫連動" : ""}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="description">明細名</label><input id="description" name="description" placeholder="商品選択時は省略可" /></div>
              <div className="field"><label htmlFor="quantity">数量</label><input id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></div>
              <div className="field"><label htmlFor="unit">単位</label><input id="unit" name="unit" placeholder="個、回など" /></div>
              <div className="field"><label htmlFor="unit_price">単価</label><input id="unit_price" name="unit_price" type="number" min="0" step="1" placeholder="商品選択時は省略可" /></div>
            </div>
            <PendingSubmitButton pendingLabel="明細を追加しています...">追加して在庫へ反映</PendingSubmitButton>
          </form>
        ) : null}
      </section>

      {archivedItems.length > 0 ? (
        <section className="card">
          <h2>削除した明細</h2>
          <table className="table compact">
            <thead><tr><th>明細</th><th>数量</th><th>操作</th></tr></thead>
            <tbody>{archivedItems.map((line) => (
              <tr key={line.id} className="archive-row">
                <td>{line.description}</td><td>{line.quantity}{line.unit}</td>
                <td>{!(["completed", "invoiced", "cancelled"] as string[]).includes(order.status) ? <form action={restoreOrderItemAction.bind(null, store.id, order.id, line.id)}><PendingSubmitButton className="button secondary" pendingLabel="戻しています...">元に戻す</PendingSubmitButton></form> : "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : null}

      <section className="card">
        <h2>ステータス履歴</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>変更前</th><th>変更後</th><th>メモ</th></tr></thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{dateTime(log.created_at)}</td>
                <td>{labelFor(orderStatusLabels, log.from_status, "-")}</td>
                <td><span className="badge">{labelFor(orderStatusLabels, log.to_status)}</span></td>
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
