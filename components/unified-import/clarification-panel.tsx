"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ImportClarificationIssue, ImportClarificationResolution } from "@/lib/unified-import/clarification";
import type { ClarificationPreview } from "@/lib/unified-import/clarification-data";
import { groupImportReviewIssues } from "@/lib/unified-import/review-groups";

type Props = {
  issues: ImportClarificationIssue[]; revision: string; quality: string;
  tableTypes: Record<string, string>; fieldLabels: Record<string, string>;
  previewAction: (form: FormData) => Promise<{ preview?: ClarificationPreview; error?: string }>;
  applyAction: (form: FormData) => Promise<{ success?: boolean; error?: string }>;
};
const qualityLabels: Record<string, string> = { normal: "内容を確認して取り込めます", clarifiable: "分からないところだけ教えてください", unprocessable: "確認できた表から進められます" };

export function ClarificationPanel(props: Props) {
  const [shown, setShown] = useState(3);
  const groups = groupImportReviewIssues(props.issues);
  const sourceTables = new Set(props.issues.filter((issue) => issue.severity === "unprocessable").map((issue) => issue.tableName));
  return <section className="card import-clarification-panel" aria-label="AIObからの確認">
    <h2>{qualityLabels[props.quality] ?? qualityLabels.clarifiable}</h2>
    <p>回答すると修正案を表示します。承認しても、最後に取り込みを確定するまでは売上などに反映しません。</p>
    {sourceTables.size ? <p className="notice">{sourceTables.size}表は元ファイルの確認が必要です。ファイル全体の拒否ではありません。下の整理結果で該当する表を「保留」にすると、ほかの表を先に進められます。</p> : null}
    {groups.slice(0, shown).map((group) => <Question key={`${group[0].id}:${props.revision}`} issue={group[0]} group={group} {...props} />)}
    {groups.length > shown ? <button type="button" className="button secondary" onClick={() => setShown((value) => value + 3)}>次の確認を表示（残り{groups.length - shown}件）</button> : null}
    {!props.issues.length ? <p className="notice success">追加の質問はありません。下の整理結果を確認して保存してください。</p> : null}
  </section>;
}

function Question({ issue, group = [issue], revision, tableTypes, fieldLabels, previewAction, applyAction, ...rest }: Props & { issue: ImportClarificationIssue; group?: ImportClarificationIssue[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ClarificationPreview | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState(issue.code === "expense_period" ? "keep_expense_dates" : "use_gross");
  const field = issue.field ?? "date";
  const correctRows = (issue.rowNumbers ?? []).slice(0, 50);
  const hard = issue.severity === "unprocessable";
  const supported = ["report_period", "expense_period", "invalid_date", "invalid_number", "missing_field", "reconciliation", "adjustment", "layout_confirmation"].includes(issue.code) && issue.field !== "record_type";
  function submit(form: FormData) {
    if (pending) return;
    startTransition(async () => {
      setError("");
      const common = { id: crypto.randomUUID(), tableName: issue.tableName, issueIds: [issue.id], reason: String(form.get("reason") ?? "") };
      let resolution: ImportClarificationResolution;
      if (issue.code === "report_period" || ["expense_period", "invalid_date"].includes(issue.code) && choice === "set_period") resolution = { ...common, action: "set_period", scope: tableTypes[issue.tableName] === "expense" ? "expense" : "report", year: Number(form.get("year")), month: Number(form.get("month")) };
      else if (issue.code === "expense_period") resolution = { ...common, action: "keep_expense_dates" };
      else if (issue.code === "reconciliation") resolution = { ...common, action: "use_details", observedTotals: { [issue.id]: issue.details?.actual ?? NaN } };
      else if (issue.code === "adjustment") resolution = choice === "sales_adjustment"
        ? { ...common, action: "sales_adjustment", date: String(form.get("date")), signedAmount: Number(form.get("amount")), itemName: String(form.get("item_name")), observedGross: issue.details?.actual ?? NaN, observedAdjusted: issue.details?.expected ?? NaN }
        : { ...common, action: "use_gross", observedGross: issue.details?.actual ?? NaN, observedAdjusted: issue.details?.expected ?? NaN };
      else if (issue.code === "layout_confirmation") resolution = { ...common, action: "confirm_layout" };
      else if (field === "vendor_name" && issue.code === "missing_field" && tableTypes[issue.tableName] === "expense") resolution = { ...common, action: "set_default", field: "vendor_name", value: String(form.get("value") ?? "") };
      else resolution = { ...common, action: "correct_values", corrections: correctRows.filter((row) => String(form.get(`value_${row}`) ?? "").trim()).map((row) => ({ rowNumber: row, field, value: String(form.get(`value_${row}`)) })) };
      const resolutions = resolution.action === "keep_expense_dates" ? group.map((entry) => ({ ...common, id: crypto.randomUUID(), tableName: entry.tableName, issueIds: [entry.id], action: "keep_expense_dates" })) : [resolution];
      const payload = new FormData(); payload.set("expected_revision", revision); payload.set("resolutions", JSON.stringify(resolutions));
      try { const result = await previewAction(payload); if (result.error) setError(result.error); else setPreview(result.preview ?? null); }
      catch { setError("通信を確認し、画面を更新してください。"); }
    });
  }
  function approve() {
    if (!preview || pending) return;
    startTransition(async () => {
      const form = new FormData(); form.set("expected_revision", preview.revision); form.set("proposal_id", preview.id); form.set("approved", "on");
      try { const result = await applyAction(form); if (result.error) setError(result.error); else { setPreview(null); router.refresh(); } }
      catch { setError("通信を確認し、画面を更新してください。"); }
    });
  }
  if (group.length > 1 && issue.code === "expense_period" && choice === "set_period") return <section>
    <button className="button secondary" type="button" onClick={() => setChoice("keep_expense_dates")}>日付の扱いをまとめて確認する</button>
    <p>年・月を修正する場合は、異なる月を一括上書きしないよう、対象の表ごとに指定します。</p>
    {group.map((entry) => <Question key={entry.id} issue={entry} revision={revision} tableTypes={tableTypes} fieldLabels={fieldLabels} previewAction={previewAction} applyAction={applyAction} {...rest} />)}
  </section>;
  return <article className="static-card import-clarification-question">
    <h3>{group.length > 1 && issue.code === "expense_period" ? `経費の日付をまとめて確認（${group.length}表）` : issue.tableName}</h3>
    <p><strong>{group.length > 1 && issue.code === "expense_period" ? "帳票の月と異なる経費日付があります。元の経費日付を、そのまま使ってよいですか？" : issue.message}</strong></p>
    {group.length > 1 ? <details><summary>対象の表と確認箇所（{group.length}件）</summary><ul>{group.map((entry) => <li key={entry.id}>{entry.tableName} / {entry.source.range} — {entry.message}</li>)}</ul></details> : null}
    <p className="muted">元の場所：{issue.source.sheetName} / {issue.source.cells?.join("、") || issue.source.range}</p>
    {hard ? <p>元ファイルの該当箇所を確認し、計算結果も保存して再アップロードしてください。この問題は「承認」だけでは解除できません。</p> : supported ? <form action={submit}>
      <fieldset disabled={pending || Boolean(preview)} className="import-clarification-fields">
        {issue.code === "expense_period" ? <label className="field">日付の扱い<select value={choice} onChange={(event) => setChoice(event.target.value)}><option value="keep_expense_dates">元の経費日付をそのまま使う</option><option value="set_period">{group.length > 1 ? "表ごとに年・月を修正する" : "同じ表の年・月をまとめて修正する"}</option></select></label> : null}
        {issue.code === "invalid_date" && ["sale", "expense"].includes(tableTypes[issue.tableName]) ? <label className="field">日付の修正方法<select value={choice} onChange={(event) => setChoice(event.target.value)}><option value="use_gross">間違っている行だけ修正する</option><option value="set_period">この表全体の年・月をまとめて指定する</option></select><span className="muted">まとめて指定しても、存在しない31日などは個別に確認します。</span></label> : null}
        {issue.code === "report_period" || ["expense_period", "invalid_date"].includes(issue.code) && choice === "set_period" ? <div className="grid cols-2"><label className="field">正しい年<input name="year" type="number" min="1900" max="9999" defaultValue={issue.details?.year ?? ""} required /></label><label className="field">正しい月<input name="month" type="number" min="1" max="12" defaultValue={issue.details?.month ?? ""} required /></label></div> : null}
        {issue.code === "reconciliation" ? <p className="notice">明細の合計 {issue.details?.actual?.toLocaleString("ja-JP")} を使います。元表の合計 {issue.details?.expected?.toLocaleString("ja-JP")} との差額の理由を入力してください。明細が誤りなら、元ファイルを直すか保留にしてください。</p> : null}
        {issue.code === "adjustment" ? <><p>明細合計：{issue.details?.actual?.toLocaleString("ja-JP")}円 ／ 調整後：{issue.details?.expected?.toLocaleString("ja-JP")}円</p><label className="field">どちらの内容で整理しますか<select value={choice} onChange={(event) => setChoice(event.target.value)}><option value="use_gross">明細合計を使う（調整は取り込まない）</option><option value="sales_adjustment">差額を売上の調整として別明細にする</option></select></label>{choice === "sales_adjustment" ? <div className="grid cols-2"><label className="field">調整日<input name="date" type="date" required /></label><label className="field">調整額（減額はマイナス）<input name="amount" type="number" step="0.01" required defaultValue={issue.details?.delta} /></label><label className="field">調整の名称<input name="item_name" maxLength={200} required /></label></div> : null}</> : null}
        {["invalid_date", "invalid_number", "missing_field"].includes(issue.code) && choice !== "set_period" ? field === "vendor_name" && issue.code === "missing_field" && tableTypes[issue.tableName] === "expense" ? <label className="field">この表で未入力の支払先（共通のもの）<input name="value" maxLength={200} required /><span className="muted">支払先が行ごとに異なる場合は、下の個別確認または元ファイルで修正してください。</span></label> : <><p>{fieldLabels[field] ?? field}を修正する行だけ入力してください。空欄の行は未解決のまま残ります。</p><div className="grid cols-2">{correctRows.map((row) => <label className="field" key={row}>{row}行目 · {fieldLabels[field] ?? field}<input name={`value_${row}`} type={field === "date" ? "date" : "text"} maxLength={2000} /></label>)}</div>{(issue.rowNumbers?.length ?? 0) > 50 ? <p>最初の50行です。承認後、残りの行が表示されます。</p> : null}</> : null}
        <label className="field">確認した内容・判断の理由<textarea name="reason" required minLength={2} maxLength={2000} placeholder={issue.code === "expense_period" ? "例：経費は発生日で管理するため、元の日付を使います。" : "例：帳簿を確認し、この表は2026年10月と確認しました。"} /></label>
        <button className="button" type="submit">{pending ? "修正案を確認中…" : "修正案を見る"}</button>
      </fieldset>
    </form> : <p>下の列の対応を確認してください。元の情報が不足している場合は、この表を保留できます。</p>}
    {error ? <p className="notice danger" role="alert">{error}</p> : null}
    {preview ? <section className="notice" aria-live="polite">
      <h4>修正案の確認</h4><p>変更 {preview.changedRows}行・追加 {preview.addedRows}行{preview.removedRows ? `・再確認のため撤回する調整 ${preview.removedRows}行` : ""} ／ 残りの確認 {preview.remaining}件</p>
      {preview.totals.map((entry) => <p key={entry.tableName}>{entry.tableName}：{entry.before === null ? "計算不可" : `${entry.before.toLocaleString("ja-JP")}円`} → <strong>{entry.after === null ? "計算不可" : `${entry.after.toLocaleString("ja-JP")}円`}</strong></p>)}
      <div className="unified-import-grid-scroll"><table className="table compact"><thead><tr><th>行・項目</th><th>変更前</th><th>変更後</th></tr></thead><tbody>{preview.changes.map((entry, index) => <tr key={index}><td>{entry.rowNumber}行 · {fieldLabels[entry.field] ?? entry.field}</td><td>{entry.before}</td><td>{entry.after}</td></tr>)}</tbody></table></div>
      <p>変更の先頭30項目です。元ファイルはそのまま残します。まだ売上などには反映しません。</p>
      <button type="button" className="button" onClick={approve} disabled={pending}>{pending ? "承認内容を保存中…" : "この修正案を承認する"}</button>
      <button type="button" className="button secondary" disabled={pending} onClick={() => { setPreview(null); router.refresh(); }}>閉じて回答を見直す</button>
    </section> : null}
  </article>;
}
