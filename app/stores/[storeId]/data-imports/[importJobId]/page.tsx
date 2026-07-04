import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ColumnMappingForm } from "@/components/phase4/import-forms";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getImportJob } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";
import { executeImportJobAction, saveImportMappingsAction } from "../actions";

function delimiterLabel(value: string | null) {
  if (value === "\t") return "タブ";
  if (value === ",") return "カンマ";
  return value ?? "-";
}

function formatCurrency(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

export default async function DataImportDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; importJobId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { storeId, importJobId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "data_imports")) notFound();

  const detail = await getImportJob(store.id, importJobId);
  if (!detail) notFound();

  const { job, mappings, errors } = detail;
  const industry = getIndustryConfig(store.industry_type_key);
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="取り込み詳細" description="元データ、列マッピング、正規化プレビュー、エラー行を確認します。" />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}

      <section className="grid cols-4">
        <article className="card"><p className="muted">ファイル名</p><strong>{job.original_filename ?? "-"}</strong></article>
        <article className="card"><p className="muted">文字コード</p><strong>{job.encoding ?? "-"}</strong></article>
        <article className="card"><p className="muted">区切り文字</p><strong>{delimiterLabel(job.delimiter)}</strong></article>
        <article className="card"><p className="muted">成功 / 失敗</p><strong>{job.success_rows} / {job.error_rows}</strong></article>
      </section>

      <section className="card">
        <h3>元データプレビュー</h3>
        <p>検出列: {job.detected_columns.join(" / ")}</p>
        <table className="table compact">
          <thead>
            <tr>{job.detected_columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {job.preview_rows.slice(0, 5).map((row, index) => (
              <tr key={`${index}-${job.id}`}>{job.detected_columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </section>

      <ColumnMappingForm action={saveImportMappingsAction.bind(null, store.id, job.id)} job={job} mappings={mappings} />

      <section className="card">
        <h3>取り込み前プレビュー</h3>
        {job.normalized_preview.length > 0 ? (
          <table className="table compact">
            <thead>
              <tr>
                <th>売上日</th>
                <th>商品名</th>
                <th>数量</th>
                <th>単価</th>
                <th>小計</th>
                <th>税額</th>
                <th>合計</th>
                <th>支払方法</th>
                <th>エラー</th>
              </tr>
            </thead>
            <tbody>
              {job.normalized_preview.map((row) => (
                <tr key={row.source_row_hash}>
                  <td>{row.sale_date ? new Date(row.sale_date).toLocaleDateString("ja-JP") : "-"}</td>
                  <td>{row.item_name ?? "-"}</td>
                  <td>{row.quantity}</td>
                  <td>{formatCurrency(row.unit_price)}</td>
                  <td>{formatCurrency(row.subtotal)}</td>
                  <td>{formatCurrency(row.tax_amount)}</td>
                  <td>{formatCurrency(row.gross_amount)}</td>
                  <td>{row.payment_method ?? "-"}</td>
                  <td>{row.errors.length > 0 ? row.errors.join(" / ") : "なし"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">列マッピングを保存すると正規化プレビューが表示されます。</p>}
        <form action={executeImportJobAction.bind(null, store.id, job.id)}>
          <button className="button" type="submit" disabled={job.mapping_status !== "confirmed"}>取り込みを実行</button>
        </form>
      </section>

      <section className="card">
        <h3>エラー行</h3>
        <table className="table compact">
          <thead><tr><th>行</th><th>内容</th><th>理由</th><th>状態</th></tr></thead>
          <tbody>
            {errors.map((row) => (
              <tr key={row.id}>
                <td>{row.row_number}</td>
                <td><code>{JSON.stringify(row.raw_row)}</code></td>
                <td>{row.error_message}</td>
                <td>{row.status}</td>
              </tr>
            ))}
            {errors.length === 0 ? <tr><td colSpan={4}>エラー行はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
