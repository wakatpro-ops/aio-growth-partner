import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getExpenseReceipt } from "@/lib/phase6/expense-receipts";
import { getStoreAccountingIntegration } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import type { ReceiptLine } from "@/lib/phase6/receipt-review";
import { approveExpenseReceiptAction, reanalyzeExpenseReceiptAction, sendReceiptToFreeeAction, updateExpenseReceiptAction } from "../../../compliance/actions";

const confidenceLabels: Record<string, string> = {
  vendor_name: "支払先", receipt_date: "支払日", payment_method: "支払方法", category_name: "用途",
  invoice_registration_number: "登録番号", subtotal_amount: "小計", tax_amount: "税額", total_amount: "合計", tax_rate: "税率"
};

function confidenceText(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "未判定";
}

function decode(value?: string) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export default async function ReceiptReviewPage({ params, searchParams }: {
  params: Promise<{ storeId: string; receiptId: string }>;
  searchParams: Promise<{ uploaded?: string; duplicate?: string; saved?: string; approved?: string; reanalyzed?: string; freeeReceiptSent?: string; error?: string }>;
}) {
  const { storeId, receiptId } = await params;
  const notices = await searchParams;
  const store = await getStore(storeId);
  const [receipt, freee] = await Promise.all([getExpenseReceipt(store.id, receiptId), getStoreAccountingIntegration(store.id, "freee")]);
  if (!receipt) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const confidence = receipt.field_confidence && typeof receipt.field_confidence === "object" ? receipt.field_confidence as Record<string, unknown> : {};
  const sourceItems = Array.isArray(receipt.extracted_items) ? receipt.extracted_items as ReceiptLine[] : [];
  const rows = [...sourceItems, ...Array.from({ length: Math.max(3, 8 - sourceItems.length) }, () => ({ name: "", quantity: 1, amount: 0, tax_rate: "10", tax_amount: 0, confidence: null }))].slice(0, 20);
  const approved = receipt.approval_status === "approved";
  const freeeConnected = freee?.status === "connected";
  const sendable = approved && freeeConnected && !["sent", "sending"].includes(receipt.freee_status);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="レシート内容を確認" description="AIの読み取り結果と原本を見比べ、修正してから承認します。承認するまでfreeeへは送信されません。"
        action={<Link className="button secondary" href={`/stores/${store.id}/accounting/receipts`}>一覧へ戻る</Link>} />
      <StoreBusinessNav store={store} />
      {notices.uploaded ? <p className="notice success">読み取りが完了しました。赤い項目や必須項目を確認してください。</p> : null}
      {notices.duplicate ? <p className="notice">同じファイル、または同内容の証憑がすでに登録されています。既存データを表示しています。</p> : null}
      {notices.saved ? <p className="notice success">修正内容を保存しました。内容に問題がなければ承認してください。</p> : null}
      {notices.approved ? <p className="notice success">内容を承認しました。freee接続済みの場合は送信できます。</p> : null}
      {notices.reanalyzed ? <p className="notice success">元ファイルを再解析しました。内容をもう一度確認してください。</p> : null}
      {notices.freeeReceiptSent ? <p className="notice success">freeeへ送信し、取引との関連付けを保存しました。</p> : null}
      {notices.error ? <p className="notice danger">{decode(notices.error)}</p> : null}
      {receipt.duplicate_of_id || receipt.possible_duplicates.length > 0 ? (
        <section className="notice">
          <strong>重複の可能性があります</strong>
          <p>支払先・日付・金額・登録番号が一致する証憑があります。二重計上でないことを確認してください。</p>
          {receipt.possible_duplicates.map((item: { id: string; original_file_name: string | null; created_at: string }) => (
            <Link key={item.id} href={`/stores/${store.id}/accounting/receipts/${item.id}`}>{item.original_file_name ?? "同内容の証憑"}（{new Date(item.created_at).toLocaleDateString("ja-JP")}）</Link>
          ))}
        </section>
      ) : null}
      <section className="grid cols-2">
        <article className="card">
          <h2>原本</h2>
          <p>{receipt.original_file_name ?? "ファイル名なし"}・{Number(receipt.page_count ?? 1)}ページ</p>
          {receipt.preview_url ? receipt.mime_type === "application/pdf" ? (
            <iframe className="receipt-preview-frame" src={receipt.preview_url} title="アップロードしたPDF" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="receipt-preview-image" src={receipt.preview_url} alt="アップロードしたレシート" />
          ) : <p className="notice">原本プレビューを作成できませんでした。</p>}
          <form action={reanalyzeExpenseReceiptAction.bind(null, store.id, receipt.id)}>
            <PendingSubmitButton className="button secondary" pendingLabel="再解析しています...">元ファイルを再解析</PendingSubmitButton>
          </form>
        </article>
        <article className="card">
          <h2>AI読み取り信頼度</h2>
          <p className="muted">75%未満の項目は原本との照合をおすすめします。信頼度は正しさの保証ではありません。</p>
          <div className="confidence-grid">
            {Object.entries(confidenceLabels).map(([key, label]) => {
              const value = confidence[key];
              const low = typeof value !== "number" || value < 0.75;
              return <div className={low ? "confidence-item low" : "confidence-item"} key={key}><span>{label}</span><strong>{confidenceText(value)}</strong></div>;
            })}
          </div>
          <dl className="definition-list">
            <div><dt>確認状態</dt><dd>{approved ? "承認済み" : "確認待ち"}</dd></div>
            <div><dt>freee状態</dt><dd>{receipt.freee_status === "sent" ? "送信済み" : receipt.freee_status === "error" ? "送信エラー（再送可）" : receipt.freee_status === "sending" ? "送信中" : "未送信"}</dd></div>
            <div><dt>送信回数</dt><dd>{Number(receipt.freee_attempt_count ?? 0)}回</dd></div>
            <div><dt>最終エラー</dt><dd>{receipt.freee_last_error ?? "なし"}</dd></div>
          </dl>
        </article>
      </section>
      <form className="card form" action={updateExpenseReceiptAction.bind(null, store.id, receipt.id)}>
        <h2>読み取り結果を修正</h2>
        <div className="grid cols-3">
          <div className="field"><label htmlFor="vendor_name">支払先（必須）</label><input id="vendor_name" name="vendor_name" required defaultValue={receipt.vendor_name ?? ""} /></div>
          <div className="field"><label htmlFor="receipt_date">支払日（必須）</label><input id="receipt_date" name="receipt_date" type="date" required defaultValue={receipt.receipt_date ?? ""} /></div>
          <div className="field"><label htmlFor="payment_method">支払方法</label><input id="payment_method" name="payment_method" defaultValue={receipt.payment_method ?? ""} /></div>
          <div className="field"><label htmlFor="category_name">用途・勘定科目候補</label><input id="category_name" name="category_name" defaultValue={receipt.category_name ?? ""} /></div>
          <div className="field"><label htmlFor="invoice_registration_number">登録番号</label><input id="invoice_registration_number" name="invoice_registration_number" defaultValue={receipt.invoice_registration_number ?? ""} placeholder="T＋13桁" /></div>
          <div className="field"><label htmlFor="tax_rate">代表税率</label><select id="tax_rate" name="tax_rate" defaultValue={String(receipt.tax_rate ?? "10")}><option value="10">10%</option><option value="8">8%</option><option value="0">非課税・対象外</option></select></div>
          <div className="field"><label htmlFor="subtotal_amount">税抜小計</label><input id="subtotal_amount" name="subtotal_amount" inputMode="numeric" defaultValue={Number(receipt.subtotal_amount ?? 0)} /></div>
          <div className="field"><label htmlFor="tax_amount">消費税額</label><input id="tax_amount" name="tax_amount" inputMode="numeric" defaultValue={Number(receipt.tax_amount ?? 0)} /></div>
          <div className="field"><label htmlFor="total_amount">合計金額（必須）</label><input id="total_amount" name="total_amount" inputMode="numeric" required defaultValue={Number(receipt.total_amount ?? 0)} /></div>
        </div>
        <h3>明細（8%・10%を行ごとに確認）</h3>
        <div className="table-wrap"><table><thead><tr><th>品名</th><th>数量</th><th>税込金額</th><th>税率</th><th>税額</th></tr></thead><tbody>
          {rows.map((item, index) => <tr key={index}>
            <td><input aria-label={`明細${index + 1}の品名`} name="item_name" defaultValue={item.name} /></td>
            <td><input aria-label={`明細${index + 1}の数量`} name="item_quantity" inputMode="decimal" defaultValue={item.quantity} /></td>
            <td><input aria-label={`明細${index + 1}の金額`} name="item_amount" inputMode="numeric" defaultValue={item.amount} /></td>
            <td><select aria-label={`明細${index + 1}の税率`} name="item_tax_rate" defaultValue={item.tax_rate || "10"}><option value="10">10%</option><option value="8">8%</option><option value="0">非課税</option></select></td>
            <td><input aria-label={`明細${index + 1}の税額`} name="item_tax_amount" inputMode="numeric" defaultValue={item.tax_amount} /></td>
          </tr>)}
        </tbody></table></div>
        <div className="field"><label htmlFor="ai_summary">摘要</label><textarea id="ai_summary" name="ai_summary" rows={3} defaultValue={receipt.ai_summary ?? ""} /></div>
        <div className="field"><label htmlFor="review_notes">確認メモ</label><textarea id="review_notes" name="review_notes" rows={3} defaultValue={receipt.review_notes ?? ""} /></div>
        <div className="action-row">
          <PendingSubmitButton pendingLabel="修正を保存しています...">修正内容を保存</PendingSubmitButton>
          <PendingSubmitButton className="button secondary" pendingLabel="承認しています..." formAction={approveExpenseReceiptAction.bind(null, store.id, receipt.id)}>内容を確認して承認</PendingSubmitButton>
          <Link className="button secondary" href={`/stores/${store.id}/accounting/receipts`}>キャンセルして一覧へ戻る</Link>
        </div>
      </form>
      <section className="card">
        <h2>freeeへ送信</h2>
        {!approved ? <p className="notice">先に上の内容を確認して「内容を確認して承認」を押してください。</p> : null}
        {!freeeConnected ? <p className="notice">freee事業所が未接続です。CSV出力はいつでも利用できます。</p> : null}
        <div className="action-row">
          <form action={sendReceiptToFreeeAction.bind(null, store.id, receipt.id)}><PendingSubmitButton disabled={!sendable} pendingLabel="freeeへ送信しています...">freeeへ送信</PendingSubmitButton></form>
          <Link className="button secondary" href={`/stores/${store.id}/settings/accounting/freee`}>freee設定を確認</Link>
          <Link className="button secondary" href={`/stores/${store.id}/accounting/exports/download?format=freee`}>freee向けCSVを出力</Link>
        </div>
      </section>
    </AppShell>
  );
}
