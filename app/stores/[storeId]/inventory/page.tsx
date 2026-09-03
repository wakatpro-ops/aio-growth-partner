import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { listBusinessItems, listInventoryStocks } from "@/lib/phase2/business-data";
import { listInventoryMovements } from "@/lib/inventory-operations";
import { getStore } from "@/lib/stores";
import { getStoreNavigationLabels } from "@/lib/store-navigation";
import { updateStockAction } from "../business/actions";

const movementLabels: Record<string, string> = {
  receipt: "仕入・入荷",
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
  const navigationLabels = getStoreNavigationLabels(store.industry_type_key);
  const [items, stocks, movements] = await Promise.all([listBusinessItems(store.id), listInventoryStocks(store.id), listInventoryMovements(store.id)]);
  const stockItems = items.filter((item) => item.is_stock_managed);
  const stockByItem = new Map(stocks.map((stock) => [stock.item_id, stock]));
  const lowStockCount = stockItems.filter((item) => Number(stockByItem.get(item.id)?.quantity ?? 0) <= Number(stockByItem.get(item.id)?.reorder_point ?? 0)).length;
  const purchaseCount = movements.filter((movement) => movement.movement_type === "receipt").length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={navigationLabels.product} description="商品・サービス、現在庫、仕入・入荷、棚卸、廃棄を業種に合わせて管理します。" action={<Link className="button" href={`/stores/${store.id}/items/new`}>{industry.businessLabels.item}を登録</Link>} />
      <StoreBusinessNav store={store} />
      {query.saved ? <p className="notice success">在庫変動を記録しました。一覧と履歴に反映されています。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <section className="grid cols-3">
        <article className="card"><p className="muted">在庫管理中</p><div className="metric">{stockItems.length}件</div><Link className="text-link" href={`/stores/${store.id}/items`}>商品・材料を確認 →</Link></article>
        <article className="card"><p className="muted">発注目安以下</p><div className="metric">{lowStockCount}件</div><p className="muted">数量が発注目安以下の商品です。</p></article>
        <article className="card"><p className="muted">仕入・入荷履歴</p><div className="metric">{purchaseCount}件</div><Link className="text-link" href={`/stores/${store.id}/accounting/receipts`}>仕入レシートを確認 →</Link></article>
      </section>
      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">目的から選ぶ</p><h2>{navigationLabels.product}メニュー</h2></div></div>
        <div className="hub-grid">
          <Link className="hub-link" href={`/stores/${store.id}/items`}><h3>{industry.businessLabels.item}を確認</h3><p>販売・提供する内容、価格、原価、在庫管理の対象を整理します。</p><strong>一覧を開く →</strong></Link>
          <Link className="hub-link primary" href="#inventory-entry"><h3>仕入・入荷を記録</h3><p>仕入先、仕入日、単価、数量を記録し、現在庫と原価へ反映します。</p><strong>入力する →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/accounting/receipts/new`}><h3>仕入レシートを読み取る</h3><p>レシートや伝票をOCRし、経費・freee用の確認データへ整理します。</p><strong>読み取りへ →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/data-imports/ai`}><h3>在庫表をまとめて取り込む</h3><p>CSV・Excel・PDFをAIが分類し、商品と在庫へ整理します。</p><strong>データ取り込みへ →</strong></Link>
        </div>
      </section>
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
        <form className="card form" id="inventory-entry" action={updateStockAction.bind(null, store.id)}>
          <h3>仕入・在庫変動を記録</h3>
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
              <option value="receipt">仕入・入荷</option>
              <option value="stocktake">棚卸後の数量に合わせる</option>
              <option value="waste">廃棄</option>
              <option value="return_in">返品受入</option>
              <option value="transfer_in">店舗間移動（入庫）</option>
              <option value="transfer_out">店舗間移動（出庫）</option>
              <option value="adjustment">増減調整（負数可）</option>
            </select>
          </div>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="purchase_date">仕入日</label>
              <input id="purchase_date" name="purchase_date" type="date" defaultValue={today} />
            </div>
            <div className="field">
              <label htmlFor="supplier_name">仕入先</label>
              <input id="supplier_name" name="supplier_name" placeholder="例：〇〇食品／△△商事" />
            </div>
            <div className="field">
              <label htmlFor="unit_cost">仕入単価（税区分は会計側で確認）</label>
              <input id="unit_cost" name="unit_cost" type="number" min="0" step="1" placeholder="0" />
            </div>
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
            <textarea id="reason" name="reason" placeholder="例：通常仕入／破損のため廃棄／棚卸差異の調整" required />
          </div>
          <div className="form-actions">
            <PendingSubmitButton pendingLabel="仕入・在庫変動を記録しています..." disabled={stockItems.length === 0}>仕入・在庫変動を記録</PendingSubmitButton>
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
