"use client";

import { useMemo, useState } from "react";
import type { UnifiedImportRecordType } from "@/types/unified-import";

type Field = { key: string; required: boolean };
type Sheet = {
  name: string;
  rowCount: number;
  confidence: number;
  headers: string[];
  selectedType: UnifiedImportRecordType;
  mapping: Record<string, string>;
  fields: Field[];
  rows: Array<{ id: string; rowNumber: number; rawData: Record<string, string> }>;
  reused: boolean;
  sourceSheetName?: string;
  sourceRange?: string;
  layout?: "flat" | "matrix";
  notices?: string[];
  requiresConfirmation?: boolean;
  confirmed?: boolean;
  blockingIssues?: string[];
  excludedReason?: string;
  amountTotal?: number | null;
};

const typeOptions: Array<[UnifiedImportRecordType, string]> = [
  ["sale", "売上"], ["expense", "経費・仕入"], ["customer", "顧客"],
  ["item", "商品・メニュー"], ["inventory", "在庫"],
  ["unknown", "まだ分からない"], ["ignore", "取り込まない"]
];

function short(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || "—";
}

export function MappingReviewPanel({ sheets, fieldLabels }: { sheets: Sheet[]; fieldLabels: Record<string, string> }) {
  return <div className="unified-import-sheets">{sheets.map((sheet, index) => <SheetReview key={sheet.name} sheet={sheet} index={index} fieldLabels={fieldLabels} />)}</div>;
}

function SheetReview({ sheet, index, fieldLabels }: { sheet: Sheet; index: number; fieldLabels: Record<string, string> }) {
  const [activeHeader, setActiveHeader] = useState<string | null>(null);
  const unresolved = useMemo(() => sheet.fields.filter((field) => field.required && !sheet.mapping[field.key]), [sheet]);
  const resolved = useMemo(() => sheet.fields.filter((field) => Boolean(sheet.mapping[field.key])), [sheet]);
  const optional = sheet.fields.filter((field) => !field.required && !sheet.mapping[field.key]);

  return (
    <article className="card unified-import-sheet-review">
      <div className="section-heading">
        <div>
          <h3>{sheet.name}</h3>
          <p className="muted">{sheet.rowCount.toLocaleString("ja-JP")}行{sheet.sourceRange ? ` ／ 元表: ${sheet.sourceSheetName ?? sheet.name} ${sheet.sourceRange}` : ""}</p>
          {sheet.amountTotal != null ? <p><strong>読み取った金額 {sheet.amountTotal.toLocaleString("ja-JP")}円</strong></p> : null}
        </div>
        {sheet.reused ? <span className="badge">この店舗の前回設定を再利用</span> : null}
      </div>
      {sheet.notices?.length ? <ul>{sheet.notices.map((notice, i) => <li key={i}>{notice}</li>)}</ul> : null}
      {sheet.excludedReason ? <p className="notice">{sheet.excludedReason} この表は重複計上を避けるため取り込みません。</p> : null}
      {sheet.blockingIssues?.length ? <div className="notice danger"><strong>この表は確認が必要です</strong><ul>{sheet.blockingIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul><p>元ファイルを修正して再アップロードするか、この表を「取り込まない」にしてください。問題のない表だけ先に取り込めます。</p></div> : null}
      <label className="field unified-import-type-field">この表の保存先
        <select name={`sheet_type_${index}`} defaultValue={sheet.selectedType} disabled={Boolean(sheet.excludedReason)}>{typeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      </label>
      {sheet.requiresConfirmation && !sheet.excludedReason && !sheet.blockingIssues?.length ? <label className="field checkbox-row"><input type="checkbox" name={`sheet_confirm_${index}`} defaultChecked={sheet.confirmed} /><span>この表の対象範囲・日付・金額を確認しました</span></label> : null}
      {!sheet.excludedReason ? <details open={unresolved.length > 0 && !sheet.blockingIssues?.length}>
      <summary>読み取った内容と列の対応を確認・変更</summary>
      <div className="unified-import-review-layout">
        <div>
          <p className="unified-import-pane-title">{sheet.layout === "matrix" ? "集計表から整理した明細（先頭12行・元セル付き）" : "元ファイルの表（先頭12行）"}</p>
          <div className="unified-import-grid-scroll">
            <table className="unified-import-source-table">
              <thead><tr><th className="row-number">行</th>{sheet.headers.map((header) => <th key={header} className={activeHeader === header ? "is-active" : ""}>{header}</th>)}</tr></thead>
              <tbody>{sheet.rows.map((row) => <tr key={row.id}><td className="row-number">{row.rowNumber}</td>{sheet.headers.map((header) => <td key={header} className={activeHeader === header ? "is-active" : ""}>{short(row.rawData[header])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
        <aside className="unified-import-assistant">
          <p className="unified-import-pane-title">AIO boostの整理結果</p>
          {sheet.selectedType === "unknown" ? <p className="notice">保存先を選んでから、列の対応を確認してください。</p> : unresolved.length > 0 ? <div className="notice"><strong>あと{unresolved.length}項目だけ教えてください</strong><p>右の選択欄を押すと、元表の対象列を強調します。</p></div> : <div className="notice"><strong>必須項目の列を整理しました</strong><p>日付・金額・対象範囲は、取り込み前に確認してください。</p></div>}
          {unresolved.map((field) => <label className="field unified-import-question" key={field.key}>{fieldLabels[field.key] ?? field.key}<span className="required-mark"> 必須</span>
            <select name={`sheet_mapping_${index}_${field.key}`} defaultValue="" onFocus={(event) => setActiveHeader(event.currentTarget.value || null)} onChange={(event) => setActiveHeader(event.currentTarget.value || null)}>
              <option value="">どの列か選択</option>{sheet.headers.map((header) => <option value={header} key={header}>{header}</option>)}
            </select>
          </label>)}
          {resolved.length > 0 ? <details className="unified-import-resolved"><summary>自動で整理した{resolved.length}項目を確認・変更</summary><div>
            {resolved.map((field) => <label className="field" key={field.key}>{fieldLabels[field.key] ?? field.key}
              <select name={`sheet_mapping_${index}_${field.key}`} defaultValue={sheet.mapping[field.key] ?? ""} onFocus={(event) => setActiveHeader(event.currentTarget.value || null)} onChange={(event) => setActiveHeader(event.currentTarget.value || null)}>
                <option value="">この列は取り込まない</option>{sheet.headers.map((header) => <option value={header} key={header}>{header}</option>)}
              </select>
            </label>)}
          </div></details> : null}
          {optional.length > 0 ? <details><summary>任意の項目を追加・同名の列を選択</summary>{optional.map((field) => <label className="field" key={field.key}>{fieldLabels[field.key] ?? field.key}<select name={`sheet_mapping_${index}_${field.key}`} defaultValue=""><option value="">取り込まない</option>{sheet.headers.map((header) => <option value={header} key={header}>{header}</option>)}</select></label>)}</details> : null}
        </aside>
      </div>
      </details> : null}
    </article>
  );
}
