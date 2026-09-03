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

  return (
    <article className="card unified-import-sheet-review">
      <div className="section-heading">
        <div>
          <h3>{sheet.name}</h3>
          <p className="muted">{sheet.rowCount.toLocaleString("ja-JP")}行を解析・分類確度 {Math.round(sheet.confidence * 100)}%</p>
        </div>
        {sheet.reused ? <span className="badge">この店舗の前回設定を再利用</span> : null}
      </div>
      <label className="field unified-import-type-field">このシートの保存先
        <select name={`sheet_type_${index}`} defaultValue={sheet.selectedType}>{typeOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      </label>

      <div className="unified-import-review-layout">
        <div>
          <p className="unified-import-pane-title">元ファイルの表（先頭12行）</p>
          <div className="unified-import-grid-scroll">
            <table className="unified-import-source-table">
              <thead><tr><th className="row-number">行</th>{sheet.headers.map((header) => <th key={header} className={activeHeader === header ? "is-active" : ""}>{header}</th>)}</tr></thead>
              <tbody>{sheet.rows.map((row) => <tr key={row.id}><td className="row-number">{row.rowNumber}</td>{sheet.headers.map((header) => <td key={header} className={activeHeader === header ? "is-active" : ""}>{short(row.rawData[header])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
        <aside className="unified-import-assistant">
          <p className="unified-import-pane-title">AIO boostの整理結果</p>
          {unresolved.length > 0 ? <div className="notice"><strong>あと{unresolved.length}項目だけ教えてください</strong><p>右の選択欄を押すと、元表の対象列を強調します。</p></div> : <div className="notice success"><strong>必須項目を自動で整理できました</strong><p>行ごとの回答は不要です。内容が違う場合だけ変更してください。</p></div>}
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
        </aside>
      </div>
    </article>
  );
}
