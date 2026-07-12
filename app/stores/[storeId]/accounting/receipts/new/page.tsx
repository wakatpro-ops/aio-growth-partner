import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { createExpenseReceiptAction } from "../../../compliance/actions";

export default async function NewExpenseReceiptPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="レシートを読み取る"
        description="仕入れ・経費のレシート写真をアップロードすると、AIOが内容を整理して会計入力の下書きを作ります。"
        action={<Link className="button secondary" href={`/stores/${store.id}/accounting/receipts`}>一覧へ戻る</Link>}
      />
      <StoreBusinessNav store={store} />
      <section className="grid cols-2">
        <form className="card form" action={createExpenseReceiptAction.bind(null, store.id)} encType="multipart/form-data">
          <h2>画像またはPDFをアップロード</h2>
          <p className="muted">対応形式: JPG、PNG、WebP、PDF。10MB以内のファイルを選択してください。</p>
          <div className="field">
            <label htmlFor="receipt_file">レシート画像</label>
            <input id="receipt_file" name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
          </div>
          <PendingSubmitButton pendingLabel="レシートを読み取っています...">読み取りを開始</PendingSubmitButton>
        </form>
        <article className="card">
          <h2>AIOが整理する内容</h2>
          <ul className="compact-list">
            <li>支払先、日付、合計金額、税額を読み取ります。</li>
            <li>消耗品、仕入、広告宣伝などの用途候補を整理します。</li>
            <li>freeeへ送る前に確認できる下書きデータを作ります。</li>
            <li>読み取り結果は必ず人間が確認してから会計処理に使ってください。</li>
          </ul>
        </article>
      </section>
    </AppShell>
  );
}
