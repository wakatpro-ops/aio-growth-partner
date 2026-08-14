import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { listCustomerImportJobs } from "@/lib/customer-crm";
import { getStore } from "@/lib/stores";
import { archiveStoreEntityAction } from "../../archive-actions";
import { uploadCustomerImportAction } from "../customer-actions";

const statusLabels: Record<string, string> = {
  preview: "内容確認中",
  processing: "取込中",
  completed: "取込完了",
  failed: "要確認"
};

export default async function CustomerImportPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ error?: string; archived?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const jobs = await listCustomerImportJobs(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow="集客・顧客"
        title="顧客データを一括取り込み"
        description="CSV・Excelの内容と列対応を確認してから顧客マスターへ取り込みます。"
        action={<Link className="button secondary" href={`/stores/${store.id}/customers`}>顧客一覧へ戻る</Link>}
      />
      <StoreBusinessNav store={store} />
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      {query.archived ? <p className="notice success">取込履歴を削除済みに移しました。顧客情報は削除されません。</p> : null}

      <section className="grid cols-2">
        <form className="card form" action={uploadCustomerImportAction.bind(null, store.id)} encType="multipart/form-data">
          <h2>1. ファイルを選択</h2>
          <p>対応形式はCSV、XLSX、XLSです。UTF-8とShift_JIS、最大10MB・2,000件まで確認できます。</p>
          <div className="field">
            <label htmlFor="customer_file">顧客ファイル</label>
            <input id="customer_file" name="customer_file" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          </div>
          <PendingSubmitButton pendingLabel="ファイルを確認しています...">内容を確認して次へ</PendingSubmitButton>
        </form>
        <article className="card">
          <h2>移行用テンプレート</h2>
          <p>名前と電話番号が必須です。その他の列は空欄でも取り込めます。</p>
          <a className="button secondary" href={`/stores/${store.id}/customers/import/template`}>顧客CSVテンプレートをダウンロード</a>
          <ul className="compact-list">
            <li>元ファイルの列順はそのままで構いません。</li>
            <li>取り込み前に列の対応と先頭10件を確認します。</li>
            <li>重複候補は電話番号を基準に、スキップまたは更新を選べます。</li>
            <li>取り込んだだけでメッセージが送信されることはありません。</li>
          </ul>
        </article>
      </section>

      <section className="card">
        <h2>取込履歴</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ファイル</th><th>状態</th><th>件数</th><th>結果</th><th>日時</th><th>操作</th></tr></thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.original_filename}</td>
                  <td><span className="badge">{statusLabels[job.status] ?? job.status}</span></td>
                  <td>{job.row_count.toLocaleString("ja-JP")}件</td>
                  <td>新規{job.success_count}／更新{job.updated_count}／エラー{job.error_count}</td>
                  <td>{new Date(job.created_at).toLocaleString("ja-JP")}</td>
                  <td><div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/customers/import/${job.id}`}>内容を見る</Link><form action={archiveStoreEntityAction.bind(null, store.id, "customer_import", job.id, `/stores/${store.id}/customers/import`)}><ConfirmSubmitButton message={`「${job.original_filename}」の取込履歴を削除済みに移します。取り込まれた顧客情報は残ります。`}>削除</ConfirmSubmitButton></form></div></td>
                </tr>
              ))}
              {jobs.length === 0 ? <tr><td colSpan={6}>顧客データの取込履歴はまだありません。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
