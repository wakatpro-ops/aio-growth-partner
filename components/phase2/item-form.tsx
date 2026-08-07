import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { BusinessItem } from "@/types/phase2";
import type { IndustryTypeKey } from "@/types/domain";

export function ItemForm({
  action,
  item,
  labels,
  industryTypeKey
}: {
  action: (formData: FormData) => void;
  item?: BusinessItem | null;
  labels: { product: string; part: string; service: string };
  industryTypeKey: IndustryTypeKey;
}) {
  const showReducedTaxRate = industryTypeKey === "restaurant" || industryTypeKey === "retail";
  const taxInclusion = item?.metadata?.tax_inclusion === "exclusive" ? "exclusive" : "inclusive";
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
          <label htmlFor="tax_inclusion">販売価格の表示</label>
          <select id="tax_inclusion" name="tax_inclusion" defaultValue={taxInclusion}>
            <option value="inclusive">税込（内税）</option>
            <option value="exclusive">税抜（外税）</option>
          </select>
          <p className="muted">入力した販売単価に消費税を含むか選びます。</p>
        </div>
        <div className="field">
          <label htmlFor="tax_rate">消費税率</label>
          <select id="tax_rate" name="tax_rate" defaultValue={String(item?.tax_rate ?? 10)}>
            <option value="10">10%</option>
            {showReducedTaxRate ? <option value="8">8%（軽減税率の対象商品のみ）</option> : null}
            <option value="0">0%（非課税）</option>
          </select>
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
      <PendingSubmitButton pendingLabel="入力内容を保存しています...">{item ? "変更を保存" : "登録して一覧へ"}</PendingSubmitButton>
    </form>
  );
}
