import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { listBusinessItems, listInventoryStocks } from "@/lib/phase2/business-data";
import { listInventoryMovements } from "@/lib/inventory-operations";
import { getStore } from "@/lib/stores";
import { updateStockAction } from "../business/actions";

const movementLabels: Record<string, string> = {
  receipt: "入荷",
  stocktake: "棚卸",
  waste: "廃棄",
  return_in: "返品受入",
  transfer_in: "店舗間移動（入庫）",
  transfer_out: "店舗間移動（出庫）",
  adjustment: "増減調整",
  order_reserve: "受注引当",
  order_release: "引当解除",
  order_fulfill: "受注完了",
  order_return: "受注取消・復元",
  sale: "売上取込"
};

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("ja-JP")}`;
}

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [items, stocks, movements] = await Promise.all([listBusinessItems(store.id), listInventoryStocks(store.id), listInventoryMovements(store.id)]);
  const stockItems = items.filter((item) => item.is_stock_managed);
  const stockByItem = new Map(stocks.map((stock) => [stock.item_id, stock]));

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={industry.businessLabels.stock} description="入荷・棚卸・廃棄・返品と、受注・売上による自動増減を履歴付きで管理します。" />
      <StoreBusinessNav store={store} />
      {query.saved ? <p className="notice success">在庫変動を記録しました。一覧と履歴に反映されています。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <div className="grid cols-2">
        <section className="card">
          <h3>在庫一覧</h3>
          <table className="table compact">
            <thead>
              <tr>
                <th>名称</th>
                <th>数量</th>
                <th>発注目安</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item) => {
                const stock = stockByItem.get(item.id);
                const quantity = Number(stock?.quantity ?? 0);
                const reserved = Number(stock?.reserved_quantity ?? 0);
                return <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{quantity.toLocaleString("ja-JP")} {item.unit}<br /><span className="muted">引当 {reserved.toLocaleString("ja-JP")}／利用可能 {(quantity - reserved).toLocaleString("ja-JP")}</span></td>
                  <td>{Number(stock?.reorder_point ?? 0).toLocaleString("ja-JP")}</td>
                </tr>
              })}
              {stockItems.length === 0 ? <tr><td colSpan={3}>在庫管理する商品・メニューがありません。先に商品・サービスから登録してください。</td></tr> : null}
            </tbody>
          </table>
        </section>
        <form className="card form" action={updateStockAction.bind(null, store.id)}>
          <h3>在庫変動を記録</h3>
          <div className="field">
            <label htmlFor="item_id">対象</label>
            <select id="item_id" name="item_id" required>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="movement_type">理由</label>
            <select id="movement_type" name="movement_type" defaultValue="receipt">
              <option value="receipt">入荷</option>
              <option value="stocktake">棚卸後の数量に合わせる</option>
              <option value="waste">廃棄</option>
              <option value="return_in">返品受入</option>
              <option value="transfer_in">店舗間移動（入庫）</option>
              <option value="transfer_out">店舗間移動（出庫）</option>
              <option value="adjustment">増減調整（負数可）</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="quantity">数量</label>
            <input id="quantity" name="quantity" type="number" step="0.01" defaultValue="1" required />
            <span className="muted">棚卸は棚卸後の実数、増減調整だけは負数も入力できます。</span>
          </div>
          <div className="field">
            <label htmlFor="reorder_point">発注目安</label>
            <input id="reorder_point" name="reorder_point" type="number" step="0.01" defaultValue="0" />
          </div>
          <div className="field">
            <label htmlFor="reason">変更理由 <span className="required-mark">必須</span></label>
            <textarea id="reason" name="reason" placeholder="例：8月15日の入荷分／破損のため廃棄" required />
          </div>
          <div className="form-actions">
            <PendingSubmitButton pendingLabel="在庫変動を記録しています..." disabled={stockItems.length === 0}>在庫変動を記録</PendingSubmitButton>
            <a className="button secondary" href={`/stores/${store.id}/sales-hub`}>売上へ戻る</a>
          </div>
        </form>
      </div>

      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">操作証跡</p><h2>在庫変動履歴</h2></div><span className="badge">{movements.length}件</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>日時</th><th>担当</th><th>対象</th><th>理由</th><th>実在庫</th><th>引当</th><th>変更後</th></tr></thead>
            <tbody>
              {movements.map((movement) => <tr key={movement.id}>
                <td>{new Date(movement.occurred_at).toLocaleString("ja-JP")}</td>
                <td>{movement.actor_name ?? "システム"}</td>
                <td>{movement.item?.name ?? movement.item_id}</td>
                <td><span className="badge">{movementLabels[movement.movement_type] ?? movement.movement_type}</span><br /><span className="muted">{movement.reason ?? "理由未記録"}</span></td>
                <td>{signed(Number(movement.quantity_delta ?? 0))}</td>
                <td>{signed(Number(movement.reserved_delta ?? 0))}</td>
                <td>{Number(movement.balance_after ?? 0).toLocaleString("ja-JP")}（引当 {Number(movement.reserved_after ?? 0).toLocaleString("ja-JP")}）</td>
              </tr>)}
              {movements.length === 0 ? <tr><td colSpan={7}>在庫変動はまだありません。上のフォームから最初の入荷または棚卸を記録してください。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
