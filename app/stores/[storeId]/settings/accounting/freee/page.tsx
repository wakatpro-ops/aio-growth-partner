import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getStoreAccountingIntegration } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { updateFreeeIntegrationAction } from "../../../compliance/actions";

export default async function FreeeSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const { saved } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const integration = await getStoreAccountingIntegration(store.id, "freee");
  const config = integration?.config ?? {};

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="freee会計設定" description="freee事業所情報と、会計ソフトに取り込むCSV出力を管理します。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">freee連携情報を保存しました。</p> : null}
      <section className="card form">
        <h2>freee事業所情報</h2>
        <form action={updateFreeeIntegrationAction.bind(null, store.id)} className="grid cols-2">
          <div className="field">
            <label htmlFor="status">接続状態</label>
            <select id="status" name="status" defaultValue={integration?.status ?? "manual_csv"}>
              <option value="not_connected">未接続</option>
              <option value="manual_csv">CSV連携で運用中</option>
              <option value="connected">API接続済み</option>
              <option value="error">エラー</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="external_company_id">freee事業所ID</label>
            <input id="external_company_id" name="external_company_id" defaultValue={integration?.external_company_id ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="office_name">事業所名</label>
            <input id="office_name" name="office_name" defaultValue={integration?.office_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="note">運用メモ</label>
            <input id="note" name="note" defaultValue={typeof config.note === "string" ? config.note : ""} />
          </div>
          <PendingSubmitButton pendingLabel="freee情報を保存しています...">保存</PendingSubmitButton>
        </form>
      </section>
      <section className="card">
        <h2>freee向けCSV</h2>
        <p>請求書、入金、外部売上データをまとめて、freee取り込み前の確認用CSVとして出力します。</p>
        <a className="button secondary" href={`/stores/${store.id}/accounting/exports/download?format=freee`}>freee向けCSVをダウンロード</a>
      </section>
    </AppShell>
  );
}
