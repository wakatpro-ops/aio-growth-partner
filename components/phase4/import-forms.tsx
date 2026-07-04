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
          <label htmlFor="file">CSV / Excelファイル</label>
          <input id="file" name="file" type="file" accept=".csv,.tsv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </div>
      </div>
      <button className="button" type="submit">アップロードしてプレビュー</button>
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
      <button className="button" type="submit">マッピングを保存して正規化プレビュー</button>
    </form>
  );
}
