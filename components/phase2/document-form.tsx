import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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
          <input id="document_number" name="document_number" defaultValue={document?.document_number ?? (kind === "estimate" ? `${numberPrefix}-${today.replaceAll("-", "")}` : "")} placeholder={kind === "invoice" ? "空欄なら連番で自動採番" : undefined} required={kind === "estimate"} />
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
            <option value="ordered">受注</option>
            <option value="in_progress">作業中</option>
            <option value="completed">作業完了</option>
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
        {kind === "invoice" ? (
          <>
            <div className="field">
              <label htmlFor="transaction_date">取引年月日</label>
              <input id="transaction_date" name="transaction_date" type="date" defaultValue={document?.transaction_date ?? document?.issue_date ?? today} />
            </div>
            <div className="field">
              <label htmlFor="invoice_registration_number">登録番号</label>
              <input id="invoice_registration_number" name="invoice_registration_number" defaultValue={document?.invoice_registration_number ?? ""} placeholder="Tから始まる登録番号" />
            </div>
            <div className="field">
              <label htmlFor="qualified_invoice_issuer_name">適格請求書発行事業者名</label>
              <input id="qualified_invoice_issuer_name" name="qualified_invoice_issuer_name" defaultValue={document?.qualified_invoice_issuer_name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="payment_status">入金状態</label>
              <select id="payment_status" name="payment_status" defaultValue={document?.payment_status ?? "unpaid"}>
                <option value="not_billed">未請求</option>
                <option value="billed">請求済み</option>
                <option value="unpaid">未入金</option>
                <option value="partially_paid">一部入金</option>
                <option value="paid">入金済み</option>
                <option value="void">取消</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="payment_method">支払方法</label>
              <select id="payment_method" name="payment_method" defaultValue={document?.payment_method ?? ""}>
                <option value="">未設定</option>
                <option value="cash">現金</option>
                <option value="credit_card">クレジットカード</option>
                <option value="qr_payment">QR決済</option>
                <option value="bank_transfer">銀行振込</option>
                <option value="other">その他</option>
              </select>
            </div>
          </>
        ) : null}
        <div className="field">
          <label htmlFor="subtotal">小計</label>
          <input id="subtotal" name="subtotal" type="number" min="0" step="1" defaultValue={document?.subtotal ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_total">消費税</label>
          <input id="tax_total" name="tax_total" type="number" min="0" step="1" defaultValue={document?.tax_total ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_10_subtotal">10%対象 小計</label>
          <input id="tax_10_subtotal" name="tax_10_subtotal" type="number" min="0" step="1" defaultValue={document?.tax_10_subtotal ?? document?.subtotal ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_10_amount">10%消費税</label>
          <input id="tax_10_amount" name="tax_10_amount" type="number" min="0" step="1" defaultValue={document?.tax_10_amount ?? document?.tax_total ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_8_subtotal">8%対象 小計</label>
          <input id="tax_8_subtotal" name="tax_8_subtotal" type="number" min="0" step="1" defaultValue={document?.tax_8_subtotal ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="tax_8_amount">8%消費税</label>
          <input id="tax_8_amount" name="tax_8_amount" type="number" min="0" step="1" defaultValue={document?.tax_8_amount ?? 0} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="notes">備考</label>
        <textarea id="notes" name="notes" defaultValue={document?.notes ?? ""} />
      </div>
      <PendingSubmitButton pendingLabel="書類を保存しています...">保存</PendingSubmitButton>
    </form>
  );
}
