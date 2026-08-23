import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getStore } from "@/lib/stores";
import { listUnifiedImportJobs } from "@/lib/unified-import/data";
import { archiveStoreEntityAction } from "../../archive-actions";
import { uploadUnifiedImportAction } from "./actions";

const statusLabels: Record<string, string> = {
  analyzing: "解析中",
  questions_required: "回答が必要",
  review_required: "確認待ち",
  review_ready: "承認待ち",
  importing: "取込中",
  completed: "完了",
  partial_failed: "一部失敗",
  failed: "失敗"
};

export default async function UnifiedImportPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ error?: string; archived?: string; onboarding?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "data_imports")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const jobs = await listUnifiedImportJobs(store.id);
  const onboarding = query.onboarding === "1";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="AIデータ取込" description="CSV・Excel・PDFをそのままアップロードすると、売上・経費・顧客・商品・在庫へ振り分け候補を作ります。" />
      <StoreBusinessNav store={store} />
      {onboarding ? <section className="notice"><strong>初回設定の途中です</strong><p>ファイルを解析し、内容を確認して取り込みを確定した後、初回設定へ戻ってください。途中で戻っても解析結果は保存されています。</p><Link className="button secondary" href={`/onboarding/setup-review?storeId=${store.id}`}>初回設定へ戻る</Link></section> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      {query.archived ? <p className="notice success">取込履歴を削除しました。元ファイルと反映済みの業務データは証跡として保持されます。</p> : null}

      <form className="card form" action={uploadUnifiedImportAction.bind(null, store.id, onboarding)}>
        <h2>ファイルをアップロードして解析</h2>
        <p>ファイルの種類や列名が分からなくても構いません。AIO boostが内容を分類し、判断できないところだけ質問します。</p>
        <div className="field">
          <label htmlFor="unified_file">CSV・Excel・PDFファイル</label>
          <input id="unified_file" name="file" type="file" accept=".csv,.tsv,.xlsx,.xls,.xlsm,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </div>
        <ul className="compact-list">
          <li>20MB・合計50,000行まで、Excelは複数シートに対応します。</li>
          <li>マクロ付きExcel（XLSM）のマクロは実行せず、保存済みのセル値だけを読み取ります。</li>
          <li>人が確認して「取り込みを確定」するまで、売上・経費などの本データには反映しません。</li>
          <li>経費はfreeeへ送信せず、送信前の確認データとして保存します。</li>
        </ul>
        <PendingSubmitButton pendingLabel="ファイルを安全に解析しています...">アップロードしてAI解析</PendingSubmitButton>
      </form>

      <section className="card">
        <div className="section-heading"><div><h2>AIデータ取込履歴</h2><p className="muted">分析結果・質問・反映結果を後から確認できます。</p></div><Link className="button secondary" href={`/stores/${store.id}/data-imports`}>売上専用の取込履歴</Link></div>
        <table className="table">
          <thead><tr><th>ファイル</th><th>シート/行</th><th>状態</th><th>成功/失敗</th><th>作成日</th><th>操作</th></tr></thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.original_filename}{job.macro_enabled ? <><br /><span className="badge">マクロ付き・未実行</span></> : null}</td>
                <td>{job.sheet_summaries.length} / {job.total_rows.toLocaleString("ja-JP")}</td>
                <td><span className="badge">{statusLabels[job.status] ?? job.status}</span></td>
                <td>{job.success_rows.toLocaleString("ja-JP")} / {job.error_rows.toLocaleString("ja-JP")}</td>
                <td>{new Date(job.created_at).toLocaleString("ja-JP")}</td>
                <td><div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/data-imports/ai/${job.id}${onboarding ? "?onboarding=1" : ""}`}>解析結果を確認</Link><form action={archiveStoreEntityAction.bind(null, store.id, "unified_import", job.id, `/stores/${store.id}/data-imports/ai`)}><ConfirmSubmitButton message={`取込履歴「${job.original_filename}」を削除します。反映済みの売上・経費などは証跡として保持され、取込履歴は削除済み画面から元に戻せます。`}>削除</ConfirmSubmitButton></form></div></td>
              </tr>
            ))}
            {jobs.length === 0 ? <tr><td colSpan={6}>まだAIデータ取込履歴がありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
