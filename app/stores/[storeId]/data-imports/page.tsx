import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listImportJobs } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";
import { archiveStoreEntityAction } from "../archive-actions";

const statusLabels: Record<string, string> = {
  uploaded: "アップロード済み",
  mapping_required: "マッピング待ち",
  preview_ready: "プレビュー済み",
  importing: "取り込み中",
  completed: "成功",
  partial_failed: "一部失敗",
  failed: "失敗",
  canceled: "キャンセル"
};

export default async function DataImportsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ archived?: string }> }) {
  const { storeId } = await params;
  const { archived } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "data_imports")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const jobs = await listImportJobs(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="データ取り込み"
        description="AIに任せる共通取込と、列を指定する売上専用取込を選べます。"
        action={<div className="button-row"><Link className="button" href={`/stores/${store.id}/data-imports/ai`}>AIに任せて取り込む</Link><Link className="button secondary" href={`/stores/${store.id}/data-imports/new`}>売上だけ取り込む</Link></div>}
      />
      <StoreBusinessNav store={store} />
      {archived ? <p className="notice success">取込履歴を削除しました。取り込み済みの売上データは会計・分析の証跡として保持されます。</p> : null}
      <section className="card"><h2>どの種類か分からないファイルはこちら</h2><p>マクロ付きExcelや、売上・経費・顧客・商品・在庫が混ざったファイルは、AIデータ取込が内容を分類して不明点だけ質問します。</p><Link className="button" href={`/stores/${store.id}/data-imports/ai`}>AIデータ取込を開く</Link></section>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>取り込み元</th>
              <th>ファイル</th>
              <th>状態</th>
              <th>成功/失敗</th>
              <th>作成日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.data_source?.name ?? "未設定"}</td>
                <td>{job.original_filename ?? "-"}</td>
                <td><span className="badge">{statusLabels[job.status] ?? job.status}</span></td>
                <td>{job.success_rows.toLocaleString("ja-JP")} / {job.error_rows.toLocaleString("ja-JP")}</td>
                <td>{new Date(job.created_at).toLocaleString("ja-JP")}</td>
                <td><div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/data-imports/${job.id}`}>詳細</Link><form action={archiveStoreEntityAction.bind(null, store.id, "data_import", job.id, `/stores/${store.id}/data-imports`)}><ConfirmSubmitButton message={`取込履歴「${job.original_filename ?? job.id}」を削除します。取り込み済み売上は証跡として保持されます。`}>削除</ConfirmSubmitButton></form></div></td>
              </tr>
            ))}
            {jobs.length === 0 ? <tr><td colSpan={6}>まだ取り込み履歴がありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
