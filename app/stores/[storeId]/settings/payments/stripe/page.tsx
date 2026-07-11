import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getStorePaymentIntegration } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { updateStripeIntegrationAction } from "../../../compliance/actions";

export default async function StripeSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const { saved } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const integration = await getStorePaymentIntegration(store.id, "stripe");
  const config = integration?.config ?? {};

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Stripe決済設定" description="店舗で利用するStripe情報と、請求書に登録する決済URLを管理します。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">Stripe連携情報を保存しました。</p> : null}
      <section className="card form">
        <h2>Stripe情報</h2>
        <form action={updateStripeIntegrationAction.bind(null, store.id)} className="grid cols-2">
          <div className="field">
            <label htmlFor="status">接続状態</label>
            <select id="status" name="status" defaultValue={integration?.status ?? "manual_ready"}>
              <option value="not_connected">未接続</option>
              <option value="manual_ready">手動連携で運用中</option>
              <option value="connected">接続済み</option>
              <option value="error">エラー</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="external_account_id">Connected account ID</label>
            <input id="external_account_id" name="external_account_id" defaultValue={integration?.external_account_id ?? ""} placeholder="acct_..." />
          </div>
          <div className="field">
            <label htmlFor="account_name">Stripeアカウント名</label>
            <input id="account_name" name="account_name" defaultValue={integration?.account_name ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="dashboard_url">Stripe管理画面URL</label>
            <input id="dashboard_url" name="dashboard_url" defaultValue={typeof config.dashboard_url === "string" ? config.dashboard_url : ""} />
          </div>
          <label className="check-row"><input type="checkbox" name="charges_enabled" defaultChecked={Boolean(integration?.charges_enabled)} />決済受付可能</label>
          <label className="check-row"><input type="checkbox" name="payouts_enabled" defaultChecked={Boolean(integration?.payouts_enabled)} />入金可能</label>
          <div className="field full-span">
            <label htmlFor="note">運用メモ</label>
            <textarea id="note" name="note" defaultValue={typeof config.note === "string" ? config.note : ""} />
          </div>
          <PendingSubmitButton pendingLabel="Stripe情報を保存しています...">保存</PendingSubmitButton>
        </form>
      </section>
      <section className="card">
        <h2>この画面でできること</h2>
        <ul className="compact-list">
          <li>請求書ごとにStripe決済URLを登録できます。</li>
          <li>Stripeで決済済みになった請求書を、AIO上で入金済みとして記録できます。</li>
          <li>外部決済履歴を残し、入金管理で確認できます。</li>
        </ul>
      </section>
    </AppShell>
  );
}
