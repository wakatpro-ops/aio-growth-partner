import type { BusinessItem } from "@/types/phase2";

export function ItemForm({
  action,
  item,
  labels
}: {
  action: (formData: FormData) => void;
  item?: BusinessItem | null;
  labels: { product: string; part: string; service: string };
}) {
  return (
    <form className="card form" action={action}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="name">名称</label>
          <input id="name" name="name" defaultValue={item?.name} required />
        </div>
        <div className="field">
          <label htmlFor="item_type">種別</label>
          <select id="item_type" name="item_type" defaultValue={item?.item_type ?? "product"}>
            <option value="product">{labels.product}</option>
            <option value="part">{labels.part}</option>
            <option value="service">{labels.service}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sku">管理番号</label>
          <input id="sku" name="sku" defaultValue={item?.sku ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="unit">単位</label>
          <input id="unit" name="unit" defaultValue={item?.unit ?? "個"} />
        </div>
        <div className="field">
          <label htmlFor="unit_price">販売単価</label>
          <input id="unit_price" name="unit_price" type="number" min="0" step="1" defaultValue={item?.unit_price ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="cost_price">原価</label>
          <input id="cost_price" name="cost_price" type="number" min="0" step="1" defaultValue={item?.cost_price ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_rate">税率</label>
          <input id="tax_rate" name="tax_rate" type="number" min="0" step="0.1" defaultValue={item?.tax_rate ?? 10} />
        </div>
        <div className="field">
          <label htmlFor="status">状態</label>
          <select id="status" name="status" defaultValue={item?.status ?? "active"}>
            <option value="active">有効</option>
            <option value="inactive">停止</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">説明</label>
        <textarea id="description" name="description" defaultValue={item?.description ?? ""} />
      </div>
      <label className="check-row">
        <input type="checkbox" name="is_stock_managed" defaultChecked={item?.is_stock_managed ?? true} />
        在庫管理する
      </label>
      {!item ? (
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="quantity">初期在庫数</label>
            <input id="quantity" name="quantity" type="number" step="0.01" defaultValue="0" />
          </div>
          <div className="field">
            <label htmlFor="reorder_point">発注目安</label>
            <input id="reorder_point" name="reorder_point" type="number" step="0.01" defaultValue="0" />
          </div>
        </div>
      ) : null}
      <button className="button" type="submit">保存</button>
    </form>
  );
}
