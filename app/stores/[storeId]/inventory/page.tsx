import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listBusinessItems, listInventoryStocks } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { updateStockAction } from "../business/actions";

export default async function InventoryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [items, stocks] = await Promise.all([listBusinessItems(store.id), listInventoryStocks(store.id)]);
  const stockItems = items.filter((item) => item.is_stock_managed);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={industry.businessLabels.stock} description="在庫管理対象の数量と発注目安を更新します。" />
      <StoreBusinessNav store={store} />
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
              {stocks.map((stock) => (
                <tr key={stock.id}>
                  <td>{stock.item?.name ?? stock.item_id}</td>
                  <td>{stock.quantity.toLocaleString("ja-JP")} {stock.item?.unit}</td>
                  <td>{stock.reorder_point.toLocaleString("ja-JP")}</td>
                </tr>
              ))}
              {stocks.length === 0 ? <tr><td colSpan={3}>在庫データがありません。</td></tr> : null}
            </tbody>
          </table>
        </section>
        <form className="card form" action={updateStockAction.bind(null, store.id)}>
          <h3>在庫を更新</h3>
          <div className="field">
            <label htmlFor="item_id">対象</label>
            <select id="item_id" name="item_id" required>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="quantity">数量</label>
            <input id="quantity" name="quantity" type="number" step="0.01" defaultValue="0" />
          </div>
          <div className="field">
            <label htmlFor="reorder_point">発注目安</label>
            <input id="reorder_point" name="reorder_point" type="number" step="0.01" defaultValue="0" />
          </div>
          <button className="button" type="submit" disabled={stockItems.length === 0}>保存</button>
        </form>
      </div>
    </AppShell>
  );
}
