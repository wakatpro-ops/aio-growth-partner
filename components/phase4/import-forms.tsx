import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { standardSalesFields } from "@/lib/phase4/import-parser";
import type { DataColumnMapping, DataImportJob } from "@/types/phase4";

const providerOptions = [
  ["manual_csv", "手動CSV"],
  ["manual_excel", "手動Excel"],
  ["air_regi", "Airレジ CSV"],
  ["smaregi", "スマレジ CSV"],
  ["square", "Square CSV"],
  ["stores_regi", "STORESレジ CSV"],
  ["pos_plus", "POS+ CSV"],
  ["shopify", "Shopify CSV"],
  ["base", "BASE CSV"]
];

export function ImportUploadForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form className="card form" action={action}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="provider_key">データ元</label>
          <select id="provider_key" name="provider_key" defaultValue="manual_csv">
            {providerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="file">CSV / Excel / PDFファイル</label>
          <input id="file" name="file" type="file" accept=".csv,.tsv,.xlsx,.xls,.xlsm,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </div>
      </div>
      <p className="muted">4MB・50,000行まで。マクロ付きExcelはマクロを実行せず、保存済みセル値だけを読み取ります。取込前に商品との対応を必ず確認できます。</p>
      <PendingSubmitButton pendingLabel="ファイルを読み込んでいます...">アップロードしてプレビュー</PendingSubmitButton>
    </form>
  );
}

export function GoogleSheetImportForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form className="card form" action={action}>
      <h2>Googleスプレッドシートから取り込む</h2>
      <p className="muted">対象シートを「リンクを知っている全員が閲覧可」にし、URLを貼り付けます。シートを更新して再取込する場合も重複データは登録しません。</p>
      <div className="grid cols-2">
        <div className="field"><label htmlFor="sheet_url">スプレッドシートURL</label><input id="sheet_url" name="sheet_url" type="url" placeholder="https://docs.google.com/spreadsheets/d/..." required /></div>
        <div className="field"><label htmlFor="sheet_gid">シートID（gid）</label><input id="sheet_gid" name="sheet_gid" inputMode="numeric" defaultValue="0" /></div>
      </div>
      <PendingSubmitButton pendingLabel="シートを取得しています...">シートを取得してプレビュー</PendingSubmitButton>
    </form>
  );
}

export function ColumnMappingForm({
  action,
  job,
  mappings
}: {
  action: (formData: FormData) => void;
  job: DataImportJob;
  mappings: DataColumnMapping[];
}) {
  return (
    <form className="card form" action={action}>
      <h3>列マッピング</h3>
      <p>元データの列をAIO側の標準項目に対応付けます。推定結果は補助なので、必要に応じて修正してください。</p>
      <table className="table compact">
        <thead>
          <tr>
            <th>元データの列名</th>
            <th>AIO側の標準項目</th>
            <th>推定</th>
          </tr>
        </thead>
        <tbody>
          {job.detected_columns.map((column, index) => {
            const mapping = mappings.find((item) => item.source_column_name === column);
            return (
              <tr key={column}>
                <td>{column}</td>
                <td>
                  <select name={`target_field_${index}`} defaultValue={mapping?.target_field ?? "ignore"}>
                    {standardSalesFields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
                  </select>
                </td>
                <td>{mapping?.created_by === "user" ? "ユーザー修正" : `${Math.round(Number(mapping?.confidence ?? 0) * 100)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <PendingSubmitButton pendingLabel="売上データを整理しています...">マッピングを保存して正規化プレビュー</PendingSubmitButton>
    </form>
  );
}
