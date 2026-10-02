import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { MappingReviewPanel } from "@/components/unified-import/mapping-review-panel";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { getUnifiedImportJob } from "@/lib/unified-import/data";
import { normalizeUnifiedRow, suggestUnifiedImportMapping, unifiedImportFields } from "@/lib/unified-import/parser";
import { parseImportNumber, validateUnifiedImportValues } from "@/lib/unified-import/value-validation";
import { UNIFIED_IMPORT_PARSER_VERSION } from "@/lib/unified-import/version";
import type { UnifiedImportRecordType } from "@/types/unified-import";
import { executeUnifiedImportAction, reanalyzeUnifiedImportAction, saveUnifiedImportReviewAction } from "../actions";

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
const fieldLabels: Record<string, string> = { date: "日付", time: "時刻", transaction_id: "会計・取引ID", item_name: "商品・メニュー名", item_code: "商品コード", category_name: "カテゴリ", quantity: "数量", unit_price: "単価", tax_amount: "税額", amount: "金額", payment_method: "支払方法", customer_name: "お客様名", staff_name: "担当スタッフ", reservation_channel: "予約経路", memo: "備考", vendor_name: "支払先", subtotal_amount: "税抜金額", invoice_registration_number: "登録番号", name: "名前", company_name: "会社名", phone: "電話番号", email: "メール", birth_date: "誕生日", gender: "性別", occupation: "職業", assigned_staff_name: "担当者", line_account: "LINE", instagram_account: "Instagram", facebook_account: "Facebook", last_visit_date: "最終来店日", visit_count: "来店回数", sku: "SKU", unit: "単位", cost_price: "原価", tax_rate: "税率", is_stock_managed: "在庫管理", description: "説明", movement_type: "入出庫区分", reorder_point: "発注点", reason: "理由" };
const statusLabels: Record<string, string> = { analyzing: "確認内容を保存中", questions_required: "回答が必要", review_required: "分類結果の確認待ち", review_ready: "取り込み確定待ち", importing: "取込中", completed: "完了", partial_failed: "一部失敗", failed: "失敗" };

function previewText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text || "-";
}

export default async function UnifiedImportDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; jobId: string }>; searchParams: Promise<{ error?: string; duplicate?: string; questions?: string; reviewed?: string; completed?: string; onboarding?: string; reanalyzed?: string }> }) {
  const { storeId, jobId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) notFound();
  const { job, rows } = detail;
  const currentParser = job.answers.parser_version === UNIFIED_IMPORT_PARSER_VERSION;
  const layoutConfirmations = (job.answers.layout_confirmations ?? {}) as Record<string, boolean>;
  const industry = getIndustryConfig(store.industry_type_key);
  const resolvedMappings = new Map(job.sheet_summaries.map((sheet) => {
    const selectedType = String((job.answers.sheet_types as Record<string, string> | undefined)?.[sheet.name] ?? sheet.suggestedRecordType) as UnifiedImportRecordType;
    const mapping = (job.answers.column_mappings as Record<string, Record<string, string>> | undefined)?.[sheet.name]
      ?? sheet.suggestedMapping
      ?? suggestUnifiedImportMapping(sheet.headers, selectedType);
    return [sheet.name, { selectedType, mapping }] as const;
  }));
  const questions = rows.filter((row) => {
    if (row.review_status !== "question") return false;
    if (job.sheet_summaries.find((sheet) => sheet.name === row.sheet_name)?.blockingIssues?.length) return false;
    const sheet = resolvedMappings.get(row.sheet_name);
    const kind = row.confirmed_record_type ?? sheet?.selectedType ?? row.suggested_record_type;
    if (kind === "unknown") return false;
    const mapping = sheet?.selectedType === kind ? sheet.mapping : suggestUnifiedImportMapping(Object.keys(row.raw_data), kind);
    const normalized = normalizeUnifiedRow(row.raw_data, kind, mapping);
    const missingRowValue = normalized.missingFields.some((field) => Boolean(mapping[field]));
    return missingRowValue || validateUnifiedImportValues(kind, { ...normalized.normalizedData, ...row.user_corrections }).length > 0 || row.confidence < 0.7;
  });
  const columnQuestionCount = job.sheet_summaries.reduce((count, sheet) => {
    const resolved = resolvedMappings.get(sheet.name);
    if (!resolved || resolved.selectedType === "unknown") return count + 1;
    return count + unifiedImportFields(resolved.selectedType).filter((field) => field.required && !resolved.mapping[field.key]).length;
  }, 0);
  const structureQuestionCount = job.sheet_summaries.filter((sheet) => resolvedMappings.get(sheet.name)?.selectedType !== "ignore" && (sheet.blockingIssues?.length || (sheet.requiresConfirmation && !layoutConfirmations[sheet.name]))).length;
  const questionCount = columnQuestionCount + structureQuestionCount + questions.length;
  const previews = rows.slice(0, 50);
  const results = rows.filter((row) => ["imported", "error"].includes(row.review_status));
  const countTypes = ["sale", "expense", "customer", "item", "inventory", "ignore"] as const;
  const rowCounts = Object.fromEntries(countTypes.map((kind) => [kind, rows.filter((row) => (row.confirmed_record_type ?? resolvedMappings.get(row.sheet_name)?.selectedType ?? row.suggested_record_type) === kind).length]));
  const resultCounts = Object.fromEntries(countTypes.map((kind) => [kind, {
    success: rows.filter((row) => (row.confirmed_record_type ?? row.suggested_record_type) === kind && row.review_status === "imported").length,
    error: rows.filter((row) => (row.confirmed_record_type ?? row.suggested_record_type) === kind && row.review_status === "error").length
  }]));
  const seenRawRows = new Set<string>();
  const possibleDuplicateRows = rows.reduce((count, row) => {
    const signature = `${row.sheet_name}:${JSON.stringify(row.raw_data)}`;
    if (seenRawRows.has(signature)) return count + 1;
    seenRawRows.add(signature);
    return count;
  }, 0);
  const reusedSheets = new Set(((job.answers.mapping_reused_sheets ?? []) as string[]));
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
      {query.reanalyzed ? <p className="notice success">保存済みファイルを再解析しました。以前の解析結果は削除済み履歴に保持し、売上・経費はまだ変更していません。</p> : null}

      {canReview && !currentParser ? <section className="card"><h2>元ファイルを新しい方式で読み直せます</h2><p>以前の方式では、集計表・複数の表・同名の列を正しく読み分けられない場合がありました。未反映のファイルを読み直してから、日付と金額をご確認ください。元ファイルと以前の結果は保持します。</p><form action={reanalyzeUnifiedImportAction.bind(null, store.id, job.id, onboarding)}><ConfirmSubmitButton message="元ファイルを再解析します。以前の結果は削除済み履歴に保持され、売上・経費には反映しません。">元ファイルを再解析</ConfirmSubmitButton></form></section> : null}

      <section className="card">
        <div className="grid cols-3">
          <article><p className="muted">状態</p><strong>{statusLabels[job.status] ?? job.status}</strong></article>
          <article><p className="muted">読み分けた表</p><strong>{job.sheet_summaries.filter((sheet) => !sheet.excludedReason).length}表</strong></article>
          <article><p className="muted">確認が必要</p><strong>{questionCount}件</strong></article>
        </div>
        {job.macro_enabled ? <p className="notice">マクロ付きExcelです。安全のためマクロは実行せず、ファイルに保存されていたセル値だけを読み取りました。マクロ実行後に計算される値は、Excel側で保存してから再アップロードしてください。</p> : null}
        {Array.isArray(job.answers.parsing_notices) && job.answers.parsing_notices.length > 0 ? <details><summary>ファイルの読み取り方と対象外の内容</summary><ul>{job.answers.parsing_notices.map((notice, i) => <li key={i}>{String(notice)}</li>)}</ul></details> : null}
      </section>

      {canReview && currentParser ? (
        <form className="form" action={saveUnifiedImportReviewAction.bind(null, store.id, job.id, onboarding)}>
          <section>
            <h2>1. 元の表を見ながら、整理結果を確認</h2>
            <p>売上・経費などの表を分けて整理しました。対象範囲・日付・合計を確認してください。合計表と内訳は重ねて取り込みません。</p>
            <MappingReviewPanel
              fieldLabels={fieldLabels}
              sheets={job.sheet_summaries.map((sheet) => {
                const resolved = resolvedMappings.get(sheet.name)!;
                return {
                  name: sheet.name,
                  sourceSheetName: sheet.sourceSheetName,
                  sourceRange: sheet.sourceRange,
                  layout: sheet.layout,
                  notices: sheet.notices,
                  requiresConfirmation: sheet.requiresConfirmation,
                  confirmed: layoutConfirmations[sheet.name],
                  blockingIssues: sheet.blockingIssues,
                  excludedReason: sheet.excludedReason,
                  amountTotal: ["sale", "expense"].includes(resolved.selectedType) ? rows.filter((row) => row.sheet_name === sheet.name).reduce<number | null>((total, row) => { const amount = parseImportNumber(row.normalized_data.amount); return total === null || amount === null ? null : total + amount; }, 0) : null,
                  rowCount: sheet.rowCount,
                  confidence: sheet.confidence,
                  headers: sheet.headers,
                  selectedType: resolved.selectedType,
                  mapping: resolved.mapping,
                  fields: unifiedImportFields(resolved.selectedType).map((field) => ({ key: field.key, required: field.required })),
                  rows: rows.filter((row) => row.sheet_name === sheet.name).slice(0, 12).map((row) => ({ id: row.id, rowNumber: row.row_number, rawData: row.raw_data })),
                  reused: reusedSheets.has(sheet.name)
                };
              })}
            />
          </section>

          <section className="card">
            <h2>2. AIO boostからの質問</h2>
            <p>列の対応を決めた後も、その行だけ値が空欄などの例外がある場合に限って表示します。不要な行は「取り込まない」を選べます。</p>
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
            {questions.length === 0 ? <p className="notice">個別の行についての質問はありません。上の表ごとの確認を済ませて保存してください。</p> : null}
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
        <h2>保存先ごとの整理結果</h2>
        <p>正式データへ反映する前の予定件数です。回答が必要な行は、確定できるまで取り込みません。</p>
        <div className="unified-import-count-grid">
          {countTypes.map((kind) => <article className="static-card" key={kind}><span>{typeLabels[kind]}</span><strong>{rowCounts[kind].toLocaleString("ja-JP")}行</strong></article>)}
          <article className="static-card warning-card"><span>確認が必要</span><strong>{questionCount.toLocaleString("ja-JP")}件</strong></article>
          <article className="static-card"><span>同じ内容の行候補</span><strong>{possibleDuplicateRows.toLocaleString("ja-JP")}行</strong></article>
        </div>
        {possibleDuplicateRows > 0 ? <p className="notice">同じシート内に内容が完全一致する行が{possibleDuplicateRows}行あります。正しい複数件の場合もあるため自動削除せず、元表で確認できるようにしています。</p> : null}
        <details><summary>行ごとの解析プレビュー（先頭50行）</summary>
        <table className="table compact">
          <thead><tr><th>場所</th><th>分類</th><th>主な内容</th><th>確認状態</th></tr></thead>
          <tbody>{previews.map((row) => <tr key={row.id}><td>{row.sheet_name} {row.row_number}行</td><td>{typeLabels[row.confirmed_record_type ?? row.suggested_record_type]}</td><td>{Object.entries(row.normalized_data).slice(0, 4).map(([key, value]) => `${fieldLabels[key] ?? key}: ${previewText(value)}`).join(" / ") || Object.values(row.raw_data).slice(0, 3).map(previewText).join(" / ")}</td><td>{row.review_status === "question" ? "回答が必要" : row.review_status === "ignored" ? "取り込まない" : row.review_status === "error" ? "失敗" : row.review_status === "imported" ? "取込済み" : "確認可能"}</td></tr>)}</tbody>
        </table>
        </details>
      </section>

      {job.status === "review_ready" && currentParser ? (
        <section className="card">
          <h2>確認した内容で取り込みを確定</h2>
          <p className="notice">確定すると、分類に従って売上・経費・顧客・商品・在庫へ反映します。経費はfreee送信前の確認待ちとして保存され、自動送信されません。</p>
          <form action={executeUnifiedImportAction.bind(null, store.id, job.id, onboarding)}><ConfirmSubmitButton message={`${job.approved_rows}行を売上・経費・顧客・商品・在庫へ振り分けて取り込みます。内容を確認しましたか？`}>確認した内容で取り込みを確定</ConfirmSubmitButton></form>
        </section>
      ) : null}

      {["partial_failed", "failed"].includes(job.status) ? (
        <section className="card">
          <h2>未完了の処理を再実行</h2>
          <p className="notice danger">{job.error_message || `${job.error_rows}件を取り込めませんでした。下の結果を確認してください。`} 取込済みの行は重複登録せず、未反映の行と集計・結果保存を再試行します。</p>
          <form action={executeUnifiedImportAction.bind(null, store.id, job.id, onboarding)}><ConfirmSubmitButton message="未反映の行と集計・結果保存を再実行します。すでに取込済みの行は重複登録しません。">未完了の処理を再実行</ConfirmSubmitButton></form>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="card">
          <h2>取り込み結果</h2>
          <div className="unified-import-count-grid">
            {countTypes.filter((kind) => kind !== "ignore").map((kind) => <article className="static-card" key={kind}><span>{typeLabels[kind]}</span><strong>{resultCounts[kind].success.toLocaleString("ja-JP")}件成功</strong>{resultCounts[kind].error > 0 ? <small>{resultCounts[kind].error}件失敗</small> : null}</article>)}
          </div>
          <div className="form-actions"><Link className="button secondary" href={`/stores/${store.id}/sales`}>売上を見る</Link><Link className="button secondary" href={`/stores/${store.id}/accounting/receipts`}>経費を見る</Link><Link className="button secondary" href={`/stores/${store.id}/customers`}>顧客を見る</Link><Link className="button secondary" href={`/stores/${store.id}/items`}>商品を見る</Link><Link className="button secondary" href={`/stores/${store.id}/inventory`}>在庫を見る</Link></div>
          <table className="table compact"><thead><tr><th>場所</th><th>分類</th><th>結果</th></tr></thead><tbody>{results.slice(0, 200).map((row) => <tr key={row.id}><td>{row.sheet_name} {row.row_number}行</td><td>{typeLabels[row.confirmed_record_type ?? row.suggested_record_type]}</td><td>{row.review_status === "imported" ? "取込済み" : row.error_message}</td></tr>)}</tbody></table>
        </section>
      ) : null}
      {onboarding && ["completed", "partial_failed"].includes(job.status) ? <section className="card success-card"><h2>取り込み状況を初回設定へ反映できます</h2><p>成功{job.success_rows}件、確認できなかった行{job.error_rows}件です。初回設定へ戻ると、AIが保存先ごとの件数を説明します。</p><Link className="button" href={`/onboarding/setup-review?storeId=${store.id}`}>初回設定の続きを開く</Link></section> : null}
    </AppShell>
  );
}
