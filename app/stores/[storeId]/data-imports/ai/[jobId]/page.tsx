import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { getUnifiedImportJob } from "@/lib/unified-import/data";
import type { UnifiedImportRecordType } from "@/types/unified-import";
import { executeUnifiedImportAction, saveUnifiedImportReviewAction } from "../actions";

const typeOptions: Array<[UnifiedImportRecordType, string]> = [
  ["sale", "売上"],
  ["expense", "経費・仕入"],
  ["customer", "顧客"],
  ["item", "商品・メニュー"],
  ["inventory", "在庫"],
  ["unknown", "まだ分からない"],
  ["ignore", "取り込まない"]
];
const typeLabels = Object.fromEntries(typeOptions);
const fieldLabels: Record<string, string> = { date: "日付", item_name: "商品・メニュー名", amount: "金額", vendor_name: "支払先", name: "名前", phone: "電話番号", quantity: "数量" };
const statusLabels: Record<string, string> = { questions_required: "回答が必要", review_required: "分類結果の確認待ち", review_ready: "取り込み確定待ち", importing: "取込中", completed: "完了", partial_failed: "一部失敗", failed: "失敗" };

function previewText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text || "-";
}

export default async function UnifiedImportDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; jobId: string }>; searchParams: Promise<{ error?: string; duplicate?: string; questions?: string; reviewed?: string; completed?: string; onboarding?: string }> }) {
  const { storeId, jobId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) notFound();
  const { job, rows } = detail;
  const industry = getIndustryConfig(store.industry_type_key);
  const questions = rows.filter((row) => row.review_status === "question");
  const previews = rows.slice(0, 50);
  const results = rows.filter((row) => ["imported", "error"].includes(row.review_status));
  const canReview = ["questions_required", "review_required", "review_ready"].includes(job.status);
  const onboarding = query.onboarding === "1";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="AI解析結果を確認" description={`${job.original_filename} — ${job.total_rows.toLocaleString("ja-JP")}行`} />
      <StoreBusinessNav store={store} />
      <Link className="back-link" href={`/stores/${store.id}/data-imports/ai${onboarding ? "?onboarding=1" : ""}`}>← AIデータ取込へ戻る</Link>
      {onboarding ? <p className="notice"><strong>初回設定用の取り込みです。</strong> 分類内容を確認し、取り込みを確定するとメニュー・在庫などが各管理画面で利用できます。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      {query.duplicate ? <p className="notice">同じファイルはすでに解析済みのため、既存の結果を表示しています。</p> : null}
      {query.questions ? <p className="notice">分析結果を保存しました。まだ回答が必要な項目が{query.questions}件あります。</p> : null}
      {query.reviewed ? <p className="notice success">すべての不明点を確認しました。「確認した内容で取り込みを確定」へ進めます。</p> : null}
      {query.completed ? <p className="notice success">取り込みが完了しました。成功{job.success_rows}件、失敗{job.error_rows}件です。</p> : null}

      <section className="card">
        <div className="grid cols-3">
          <article><p className="muted">状態</p><strong>{statusLabels[job.status] ?? job.status}</strong></article>
          <article><p className="muted">解析したシート</p><strong>{job.sheet_summaries.length}シート</strong></article>
          <article><p className="muted">回答が必要</p><strong>{questions.length}件</strong></article>
        </div>
        {job.macro_enabled ? <p className="notice">マクロ付きExcelです。安全のためマクロは実行せず、ファイルに保存されていたセル値だけを読み取りました。マクロ実行後に計算される値は、Excel側で保存してから再アップロードしてください。</p> : null}
      </section>

      {canReview ? (
        <form className="form" action={saveUnifiedImportReviewAction.bind(null, store.id, job.id, onboarding)}>
          <section className="card">
            <h2>1. シートごとの取り込み先を確認</h2>
            <p>推定結果が違う場合だけ選び直してください。「取り込まない」を選ぶと、そのシートの行は本データへ反映されません。</p>
            <div className="grid cols-2">
              {job.sheet_summaries.map((sheet, index) => (
                <label className="field" key={sheet.name}>{sheet.name}（{sheet.rowCount}行・推定{Math.round(sheet.confidence * 100)}%）
                  <select name={`sheet_type_${index}`} defaultValue={String((job.answers.sheet_types as Record<string, string> | undefined)?.[sheet.name] ?? sheet.suggestedRecordType)}>
                    {typeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>2. AIO boostからの質問</h2>
            <p>分からない行と必須項目だけを表示しています。不要な行は「取り込まない」を選べます。</p>
            {questions.slice(0, 200).map((row) => (
              <article className="static-card" key={row.id}>
                <div className="section-heading"><div><strong>{row.sheet_name}・{row.row_number}行目</strong><p>{row.question}</p></div><span className="badge">推定 {typeLabels[row.suggested_record_type]} {Math.round(row.confidence * 100)}%</span></div>
                <div className="grid cols-2">
                  <label className="field">この行の種類
                    <select name={`row_type_${row.id}`} defaultValue={row.confirmed_record_type ?? row.suggested_record_type}>
                      {typeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                    </select>
                  </label>
                  {row.missing_fields.map((field) => <label className="field" key={field}>{fieldLabels[field] ?? field}<input name={`row_${row.id}_${field}`} defaultValue={String(row.user_corrections[field] ?? row.normalized_data[field] ?? "")} /></label>)}
                </div>
                <details><summary>元の行を確認</summary><dl className="definition-list">{Object.entries(row.raw_data).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{previewText(value)}</dd></div>)}</dl></details>
              </article>
            ))}
            {questions.length === 0 ? <p className="notice success">必須項目の不足や分類不明の行はありません。シートの分類を確認して保存してください。</p> : null}
            {questions.length > 200 ? <p className="notice">質問は一度に200件ずつ表示します。表示中の内容を保存すると、回答済みの行が除かれ、次の質問が表示されます。</p> : null}
          </section>

          <section className="card">
            <h2>3. 分析結果を保存</h2>
            <p>この操作では、まだ売上・経費・顧客などの本データへ反映しません。</p>
            <PendingSubmitButton pendingLabel="回答と分類を保存しています...">回答と分類を保存</PendingSubmitButton>
          </section>
        </form>
      ) : null}

      <section className="card">
        <h2>解析プレビュー（先頭50行）</h2>
        <table className="table compact">
          <thead><tr><th>場所</th><th>分類</th><th>主な内容</th><th>確認状態</th></tr></thead>
          <tbody>{previews.map((row) => <tr key={row.id}><td>{row.sheet_name} {row.row_number}行</td><td>{typeLabels[row.confirmed_record_type ?? row.suggested_record_type]}</td><td>{Object.entries(row.normalized_data).slice(0, 4).map(([key, value]) => `${fieldLabels[key] ?? key}: ${previewText(value)}`).join(" / ") || Object.values(row.raw_data).slice(0, 3).map(previewText).join(" / ")}</td><td>{row.review_status === "question" ? "回答が必要" : row.review_status === "ignored" ? "取り込まない" : row.review_status === "error" ? "失敗" : row.review_status === "imported" ? "取込済み" : "確認可能"}</td></tr>)}</tbody>
        </table>
      </section>

      {job.status === "review_ready" ? (
        <section className="card">
          <h2>確認した内容で取り込みを確定</h2>
          <p className="notice">確定すると、分類に従って売上・経費・顧客・商品・在庫へ反映します。経費はfreee送信前の確認待ちとして保存され、自動送信されません。</p>
          <form action={executeUnifiedImportAction.bind(null, store.id, job.id, onboarding)}><ConfirmSubmitButton message={`${job.approved_rows}行を売上・経費・顧客・商品・在庫へ振り分けて取り込みます。内容を確認しましたか？`}>確認した内容で取り込みを確定</ConfirmSubmitButton></form>
        </section>
      ) : null}

      {["partial_failed", "failed"].includes(job.status) ? (
        <section className="card">
          <h2>失敗した行だけ再実行</h2>
          <p className="notice danger">{job.error_rows}件を取り込めませんでした。下の結果を確認して元データを整えた後、失敗した行だけ安全に再実行できます。</p>
          <form action={executeUnifiedImportAction.bind(null, store.id, job.id, onboarding)}><ConfirmSubmitButton message="失敗した行だけを再実行します。すでに取込済みの行は重複登録しません。">失敗した行だけ再実行</ConfirmSubmitButton></form>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="card">
          <h2>取り込み結果</h2>
          <div className="form-actions"><Link className="button secondary" href={`/stores/${store.id}/sales`}>売上を見る</Link><Link className="button secondary" href={`/stores/${store.id}/accounting/receipts`}>経費を見る</Link><Link className="button secondary" href={`/stores/${store.id}/customers`}>顧客を見る</Link><Link className="button secondary" href={`/stores/${store.id}/items`}>商品を見る</Link><Link className="button secondary" href={`/stores/${store.id}/inventory`}>在庫を見る</Link></div>
          <table className="table compact"><thead><tr><th>場所</th><th>分類</th><th>結果</th></tr></thead><tbody>{results.slice(0, 200).map((row) => <tr key={row.id}><td>{row.sheet_name} {row.row_number}行</td><td>{typeLabels[row.confirmed_record_type ?? row.suggested_record_type]}</td><td>{row.review_status === "imported" ? "取込済み" : row.error_message}</td></tr>)}</tbody></table>
        </section>
      ) : null}
      {onboarding && ["completed", "partial_failed"].includes(job.status) ? <section className="card success-card"><h2>取り込み状況を初回設定へ反映できます</h2><p>成功{job.success_rows}件、確認できなかった行{job.error_rows}件です。初回設定へ戻ると、AIが保存先ごとの件数を説明します。</p><Link className="button" href={`/onboarding/setup-review?storeId=${store.id}`}>初回設定の続きを開く</Link></section> : null}
    </AppShell>
  );
}
