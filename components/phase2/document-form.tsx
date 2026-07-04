import type { BusinessDocument, Customer } from "@/types/phase2";

export function DocumentForm({
  action,
  document,
  customers,
  kind
}: {
  action: (formData: FormData) => void;
  document?: BusinessDocument | null;
  customers: Customer[];
  kind: "estimate" | "invoice";
}) {
  const numberPrefix = kind === "estimate" ? "EST" : "INV";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form className="card form" action={action}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="document_number">番号</label>
          <input id="document_number" name="document_number" defaultValue={document?.document_number ?? `${numberPrefix}-${today.replaceAll("-", "")}`} required />
        </div>
        <div className="field">
          <label htmlFor="customer_id">顧客</label>
          <select id="customer_id" name="customer_id" defaultValue={document?.customer_id ?? ""}>
            <option value="">未選択</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="title">件名</label>
          <input id="title" name="title" defaultValue={document?.title} required />
        </div>
        <div className="field">
          <label htmlFor="status">状態</label>
          <select id="status" name="status" defaultValue={document?.status ?? "draft"}>
            <option value="draft">下書き</option>
            <option value="sent">送付済み</option>
            <option value="approved">承認済み</option>
            <option value="issued">発行済み</option>
            <option value="paid">入金済み</option>
            <option value="void">無効</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="issue_date">発行日</label>
          <input id="issue_date" name="issue_date" type="date" defaultValue={document?.issue_date ?? today} />
        </div>
        {kind === "estimate" ? (
          <div className="field">
            <label htmlFor="expiry_date">有効期限</label>
            <input id="expiry_date" name="expiry_date" type="date" defaultValue={document?.expiry_date ?? ""} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="due_date">支払期限</label>
            <input id="due_date" name="due_date" type="date" defaultValue={document?.due_date ?? ""} />
          </div>
        )}
        <div className="field">
          <label htmlFor="subtotal">小計</label>
          <input id="subtotal" name="subtotal" type="number" min="0" step="1" defaultValue={document?.subtotal ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_total">消費税</label>
          <input id="tax_total" name="tax_total" type="number" min="0" step="1" defaultValue={document?.tax_total ?? 0} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="notes">備考</label>
        <textarea id="notes" name="notes" defaultValue={document?.notes ?? ""} />
      </div>
      <button className="button" type="submit">保存</button>
    </form>
  );
}
