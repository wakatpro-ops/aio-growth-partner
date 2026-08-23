"use client";

import { useMemo, useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { BusinessDocument, Customer } from "@/types/phase2";
import type { IndustryTypeKey } from "@/types/domain";

type DocumentKind = "estimate" | "invoice";
type EditorValues = {
  documentNumber: string; customerId: string; title: string; status: string; issueDate: string;
  expiryDate: string; dueDate: string; transactionDate: string; registrationNumber: string;
  issuerName: string; paymentStatus: string; paymentMethod: string; taxInclusion: "inclusive" | "exclusive";
  subtotal: number; taxTotal: number; tax10Subtotal: number; tax10Amount: number;
  tax8Subtotal: number; tax8Amount: number; notes: string;
};

const statusLabels: Record<string, string> = {
  draft: "下書き", sent: "送付済み", approved: "承認済み", ordered: "受注", in_progress: "作業中",
  completed: "作業完了", issued: "発行済み", paid: "入金済み", void: "無効"
};

function yen(value: number) { return `${Math.round(value || 0).toLocaleString("ja-JP")}円`; }
function PairMarker({ number }: { number: number }) { return <span className="document-pair-marker" aria-label={`プレビュー対応項目 ${number}`}>{number}</span>; }

export function DocumentForm({ action, document, customers, kind, industryTypeKey, storeName, storeAddress, storePhone }: {
  action: (formData: FormData) => void;
  document?: BusinessDocument | null;
  customers: Customer[];
  kind: DocumentKind;
  industryTypeKey: IndustryTypeKey;
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const showReducedTaxRate = industryTypeKey === "restaurant" || industryTypeKey === "retail";
  const [values, setValues] = useState<EditorValues>({
    documentNumber: document?.document_number ?? (kind === "estimate" ? `EST-${today.replaceAll("-", "")}` : ""),
    customerId: document?.customer_id ?? "", title: document?.title ?? "", status: document?.status ?? "draft",
    issueDate: document?.issue_date ?? today, expiryDate: document?.expiry_date ?? "", dueDate: document?.due_date ?? "",
    transactionDate: document?.transaction_date ?? document?.issue_date ?? today,
    registrationNumber: document?.invoice_registration_number ?? "",
    issuerName: document?.qualified_invoice_issuer_name ?? storeName,
    paymentStatus: document?.payment_status ?? "unpaid", paymentMethod: document?.payment_method ?? "",
    taxInclusion: document?.tax_inclusion ?? "inclusive", subtotal: document?.subtotal ?? 0, taxTotal: document?.tax_total ?? 0,
    tax10Subtotal: document?.tax_10_subtotal ?? document?.subtotal ?? 0,
    tax10Amount: document?.tax_10_amount ?? document?.tax_total ?? 0,
    tax8Subtotal: document?.tax_8_subtotal ?? 0, tax8Amount: document?.tax_8_amount ?? 0, notes: document?.notes ?? ""
  });
  const customer = useMemo(() => customers.find((item) => item.id === values.customerId), [customers, values.customerId]);
  const total = values.subtotal + values.taxTotal;
  const documentLabel = kind === "estimate" ? "御見積書" : "請求書";
  const deadlineLabel = kind === "estimate" ? "有効期限" : "支払期限";
  const deadline = kind === "estimate" ? values.expiryDate : values.dueDate;
  function update<K extends keyof EditorValues>(key: K, value: EditorValues[K]) { setValues((current) => ({ ...current, [key]: value })); }

  return <form className="document-editor" action={action}>
    <aside className="document-preview-pane" aria-label={`${documentLabel}プレビュー`}>
      <div className="document-preview-toolbar"><span>入力と同時に更新</span><strong>書類プレビュー</strong></div>
      <article className="document-sheet">
        <header className="document-sheet-header"><div><p className="document-sheet-kind">{documentLabel}</p><h2>{values.title || "件名を入力してください"}</h2></div><div className="document-sheet-number"><PairMarker number={2} /><span>書類番号</span><strong>{values.documentNumber || "自動採番"}</strong><small>{statusLabels[values.status] ?? values.status}</small></div></header>
        <section className="document-sheet-parties"><div><PairMarker number={1} /><span>お客様</span><strong>{customer?.company_name || customer?.name || "顧客を選択してください"} 御中</strong><small>{customer?.email || customer?.phone || "連絡先未選択"}</small></div><div><PairMarker number={4} /><span>発行者</span><strong>{values.issuerName || storeName}</strong><small>{storeAddress || "住所未設定"}</small><small>{storePhone || "電話番号未設定"}</small>{values.registrationNumber ? <small>登録番号 {values.registrationNumber}</small> : null}</div></section>
        <section className="document-sheet-dates"><div><span>発行日</span><strong>{values.issueDate || "未設定"}</strong></div><div><span>{deadlineLabel}</span><strong>{deadline || "未設定"}</strong></div></section>
        <section className="document-sheet-total"><PairMarker number={3} /><span>ご請求・お見積金額</span><strong>{yen(total)}</strong><small>{values.taxInclusion === "inclusive" ? "税込（内税）として入力" : "税抜（外税）として入力"}</small></section>
        <table className="document-sheet-table"><thead><tr><th>内容</th><th>税率</th><th>金額</th></tr></thead><tbody><tr><td>{values.title || "商品・サービス内容"}</td><td>10%</td><td>{yen(values.tax10Subtotal)}</td></tr>{showReducedTaxRate && values.tax8Subtotal > 0 ? <tr><td>軽減税率対象</td><td>8%</td><td>{yen(values.tax8Subtotal)}</td></tr> : null}</tbody><tfoot><tr><th colSpan={2}>小計</th><td>{yen(values.subtotal)}</td></tr><tr><th colSpan={2}>消費税</th><td>{yen(values.taxTotal)}</td></tr><tr><th colSpan={2}>合計</th><td>{yen(total)}</td></tr></tfoot></table>
        <section className="document-sheet-notes"><PairMarker number={5} /><span>備考</span><p>{values.notes || "備考はありません。"}</p></section>
      </article>
    </aside>

    <section className="document-fields-pane card form">
      <div className="document-edit-intro"><p className="eyebrow">右側を入力すると左の書類に反映されます</p><h2>{document ? `${documentLabel}を編集` : `${documentLabel}を作成`}</h2><p>同じ番号の印を見比べながら入力してください。</p></div>
      <fieldset className="document-field-group"><legend><PairMarker number={1} />お客様</legend><div className="field"><label htmlFor="customer_id">宛先となる顧客</label><select id="customer_id" name="customer_id" value={values.customerId} onChange={(event) => update("customerId", event.target.value)}><option value="">未選択</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.company_name ? `${item.company_name} / ${item.name}` : item.name}</option>)}</select><span className="muted">顧客名・会社名が書類の宛先に表示されます。</span></div></fieldset>
      <fieldset className="document-field-group"><legend><PairMarker number={2} />書類の基本情報</legend><div className="grid cols-2"><div className="field"><label htmlFor="document_number">番号</label><input id="document_number" name="document_number" value={values.documentNumber} onChange={(event) => update("documentNumber", event.target.value)} placeholder={kind === "invoice" ? "空欄なら連番で自動採番" : undefined} required={kind === "estimate"} /></div><div className="field"><label htmlFor="status">状態</label><select id="status" name="status" value={values.status} onChange={(event) => update("status", event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field full-span"><label htmlFor="title">件名</label><input id="title" name="title" value={values.title} onChange={(event) => update("title", event.target.value)} required /></div><div className="field"><label htmlFor="issue_date">発行日</label><input id="issue_date" name="issue_date" type="date" value={values.issueDate} onChange={(event) => update("issueDate", event.target.value)} /></div>{kind === "estimate" ? <div className="field"><label htmlFor="expiry_date">有効期限</label><input id="expiry_date" name="expiry_date" type="date" value={values.expiryDate} onChange={(event) => update("expiryDate", event.target.value)} /></div> : <div className="field"><label htmlFor="due_date">支払期限</label><input id="due_date" name="due_date" type="date" value={values.dueDate} onChange={(event) => update("dueDate", event.target.value)} /></div>}</div></fieldset>
      <fieldset className="document-field-group"><legend><PairMarker number={3} />金額と消費税</legend><div className="grid cols-2"><div className="field"><label htmlFor="tax_inclusion">入力金額の扱い</label><select id="tax_inclusion" name="tax_inclusion" value={values.taxInclusion} onChange={(event) => update("taxInclusion", event.target.value as EditorValues["taxInclusion"])}><option value="inclusive">税込（内税）</option><option value="exclusive">税抜（外税）</option></select></div><div className="field"><label htmlFor="subtotal">小計</label><input id="subtotal" name="subtotal" type="number" min="0" step="1" value={values.subtotal} onChange={(event) => update("subtotal", Number(event.target.value) || 0)} /></div><div className="field"><label htmlFor="tax_total">消費税合計</label><input id="tax_total" name="tax_total" type="number" min="0" step="1" value={values.taxTotal} onChange={(event) => update("taxTotal", Number(event.target.value) || 0)} /></div><div className="field"><label htmlFor="tax_10_subtotal">10%対象 小計</label><input id="tax_10_subtotal" name="tax_10_subtotal" type="number" min="0" step="1" value={values.tax10Subtotal} onChange={(event) => update("tax10Subtotal", Number(event.target.value) || 0)} /></div><div className="field"><label htmlFor="tax_10_amount">10%消費税</label><input id="tax_10_amount" name="tax_10_amount" type="number" min="0" step="1" value={values.tax10Amount} onChange={(event) => update("tax10Amount", Number(event.target.value) || 0)} /></div>{showReducedTaxRate ? <><div className="field"><label htmlFor="tax_8_subtotal">軽減税率8%対象 小計</label><input id="tax_8_subtotal" name="tax_8_subtotal" type="number" min="0" step="1" value={values.tax8Subtotal} onChange={(event) => update("tax8Subtotal", Number(event.target.value) || 0)} /></div><div className="field"><label htmlFor="tax_8_amount">軽減税率8% 消費税</label><input id="tax_8_amount" name="tax_8_amount" type="number" min="0" step="1" value={values.tax8Amount} onChange={(event) => update("tax8Amount", Number(event.target.value) || 0)} /></div></> : <><input type="hidden" name="tax_8_subtotal" value={values.tax8Subtotal} /><input type="hidden" name="tax_8_amount" value={values.tax8Amount} /></>}</div><div className="document-calculated-total"><span>プレビュー合計</span><strong>{yen(total)}</strong></div></fieldset>
      {kind === "invoice" ? <fieldset className="document-field-group"><legend><PairMarker number={4} />発行者・入金情報</legend><div className="grid cols-2"><div className="field"><label htmlFor="qualified_invoice_issuer_name">書類に表示する事業者名</label><input id="qualified_invoice_issuer_name" name="qualified_invoice_issuer_name" value={values.issuerName} onChange={(event) => update("issuerName", event.target.value)} /></div><div className="field"><label htmlFor="invoice_registration_number">適格請求書登録番号</label><input id="invoice_registration_number" name="invoice_registration_number" value={values.registrationNumber} onChange={(event) => update("registrationNumber", event.target.value)} placeholder="Tから始まる登録番号" /></div><div className="field"><label htmlFor="transaction_date">取引年月日</label><input id="transaction_date" name="transaction_date" type="date" value={values.transactionDate} onChange={(event) => update("transactionDate", event.target.value)} /></div><div className="field"><label htmlFor="payment_status">入金状態</label><select id="payment_status" name="payment_status" value={values.paymentStatus} onChange={(event) => update("paymentStatus", event.target.value)}><option value="not_billed">未請求</option><option value="billed">請求済み</option><option value="unpaid">未入金</option><option value="partially_paid">一部入金</option><option value="paid">入金済み</option><option value="void">取消</option></select></div><div className="field"><label htmlFor="payment_method">支払方法</label><select id="payment_method" name="payment_method" value={values.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}><option value="">未設定</option><option value="cash">現金</option><option value="credit_card">クレジットカード</option><option value="qr_payment">QR決済</option><option value="bank_transfer">銀行振込</option><option value="other">その他</option></select></div></div></fieldset> : <fieldset className="document-field-group"><legend><PairMarker number={4} />発行者情報</legend><div className="document-source-summary"><strong>{storeName}</strong><span>{storeAddress || "住所未設定"}</span><span>{storePhone || "電話番号未設定"}</span><small>店舗設定の情報を見積書へ自動反映します。</small></div></fieldset>}
      <fieldset className="document-field-group"><legend><PairMarker number={5} />備考</legend><div className="field"><label htmlFor="notes">お客様へ伝える補足</label><textarea id="notes" name="notes" value={values.notes} onChange={(event) => update("notes", event.target.value)} /></div></fieldset>
      <PendingSubmitButton pendingLabel="書類を保存しています...">{document ? "変更を保存して一覧へ" : `${documentLabel}を登録して一覧へ`}</PendingSubmitButton>
    </section>
  </form>;
}
