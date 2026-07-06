import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getInvoiceSettings } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { updateInvoiceSettingsAction } from "../../compliance/actions";

export default async function InvoiceSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { storeId } = await params;
  const { saved } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const settings = await getInvoiceSettings(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="インボイス請求書設定" description="登録番号、事業者名、請求書番号の連番を管理します。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">請求書設定を保存しました。</p> : null}
      <section className="card form">
        <form action={updateInvoiceSettingsAction.bind(null, store.id)} className="grid cols-2">
          <div className="field">
            <label htmlFor="registration_number">登録番号</label>
            <input id="registration_number" name="registration_number" defaultValue={settings?.registration_number ?? ""} placeholder="T1234567890123" />
          </div>
          <div className="field">
            <label htmlFor="qualified_invoice_issuer_name">適格請求書発行事業者名</label>
            <input id="qualified_invoice_issuer_name" name="qualified_invoice_issuer_name" defaultValue={settings?.qualified_invoice_issuer_name ?? store.name} />
          </div>
          <div className="field">
            <label htmlFor="prefix">請求書番号プレフィックス</label>
            <input id="prefix" name="prefix" defaultValue={settings?.prefix ?? "INV"} />
          </div>
          <div className="field">
            <label htmlFor="next_number">次の連番</label>
            <input id="next_number" name="next_number" type="number" min="1" step="1" defaultValue={settings?.next_number ?? 1} />
          </div>
          <button className="button" type="submit">保存</button>
        </form>
      </section>
      <section className="card">
        <h2>運用メモ</h2>
        <p>請求書番号を空欄で保存すると、ここで設定したプレフィックスと連番から自動採番します。既存番号を使いたい場合は請求書画面で番号を直接入力できます。</p>
      </section>
    </AppShell>
  );
}
