import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getStoreAccountingIntegration } from "@/lib/phase6/compliance-data";
import { listExpenseReceipts } from "@/lib/phase6/expense-receipts";
import { getStore } from "@/lib/stores";
import { sendReceiptToFreeeAction } from "../../compliance/actions";

function yen(value: unknown) {
  return `${Number(value ?? 0).toLocaleString("ja-JP")}円`;
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    analyzed: "読み取り済み",
    success: "読み取り済み",
    fallback: "確認待ち",
    needs_review: "確認待ち",
    review_required: "freee送信前確認",
    sent: "送信済み",
    error: "要確認"
  };
  return labels[String(status ?? "")] ?? "確認待ち";
}

export default async function ExpenseReceiptsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ uploaded?: string; freeeReceiptSent?: string }> }) {
  const { storeId } = await params;
  const { uploaded, freeeReceiptSent } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const [receipts, freee] = await Promise.all([
    listExpenseReceipts(store.id),
    getStoreAccountingIntegration(store.id, "freee")
  ]);
  const total = receipts.reduce((sum, receipt) => sum + Number(receipt.total_amount ?? 0), 0);
  const freeeConnected = freee?.status === "connected";

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="経費レシート"
        description="仕入れや経費のレシート画像を読み取り、freeeへ送る前の確認データとして整理します。"
        action={<Link className="button" href={`/stores/${store.id}/accounting/receipts/new`}>レシートを読み取る</Link>}
      />
      <StoreBusinessNav store={store} />
      {uploaded ? <p className="notice success">レシートを保存し、AIで内容を整理しました。内容を確認してから会計処理に利用してください。</p> : null}
      {freeeReceiptSent ? <p className="notice success">レシート候補をfreeeへ送信しました。</p> : null}
      <section className="grid cols-3">
        <article className="card">
          <p className="muted">読み取り件数</p>
          <div className="metric">{receipts.length.toLocaleString("ja-JP")}件</div>
        </article>
        <article className="card">
          <p className="muted">合計金額</p>
          <div className="metric">{yen(total)}</div>
        </article>
        <article className="card">
          <p className="muted">freee連携</p>
          <div className="metric">{freeeConnected ? "接続済み" : "送信前確認"}</div>
        </article>
      </section>
      {!freeeConnected ? (
        <p className="notice">freeeへ送信するには、先にfreee会計設定で事業所を接続してください。接続前でもレシート読み取りと確認データの保存はできます。</p>
      ) : null}
      <section className="card">
        <h2>読み取り結果</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>支払先</th>
                <th>用途</th>
                <th>合計</th>
                <th>税額</th>
                <th>状態</th>
                <th>freee候補</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>{receipt.receipt_date ?? "-"}</td>
                  <td>{receipt.vendor_name ?? "確認してください"}</td>
                  <td>{receipt.category_name ?? "-"}</td>
                  <td>{yen(receipt.total_amount)}</td>
                  <td>{yen(receipt.tax_amount)}</td>
                  <td><span className="badge">{statusLabel(receipt.ai_analysis_status)}</span></td>
                  <td><span className="badge">{statusLabel(receipt.freee_status)}</span></td>
                  <td>
                    <form action={sendReceiptToFreeeAction.bind(null, store.id, receipt.id)}>
                      <PendingSubmitButton
                        className="button secondary"
                        pendingLabel="freeeへ送信しています..."
                        disabled={!freeeConnected || receipt.freee_status === "sent"}
                      >
                        freeeへ送信
                      </PendingSubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
              {receipts.length === 0 ? (
                <tr>
                  <td colSpan={8}>まだレシートはありません。仕入れや経費のレシートを読み取ると、会計入力の下書きとして使えます。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {receipts[0] ? (
        <section className="card">
          <h2>最新のAI整理</h2>
          <p>{receipts[0].ai_summary ?? "レシート内容を確認し、必要な項目を補足してください。"}</p>
          <dl className="definition-list">
            <div>
              <dt>freeeへ反映する前の確認</dt>
              <dd>{statusLabel(receipts[0].freee_status)}</dd>
            </div>
            <div>
              <dt>支払先</dt>
              <dd>{receipts[0].vendor_name ?? "確認してください"}</dd>
            </div>
            <div>
              <dt>用途候補</dt>
              <dd>{receipts[0].category_name ?? "確認してください"}</dd>
            </div>
            <div>
              <dt>読み取り金額</dt>
              <dd>{yen(receipts[0].total_amount)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </AppShell>
  );
}
