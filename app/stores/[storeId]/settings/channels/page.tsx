import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { growthActionChannelLabel, listExternalChannelAccounts } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { upsertExternalChannelAccountAction } from "../../growth-actions/actions";
import type { GrowthActionChannel } from "@/types/phase5";

const channels: GrowthActionChannel[] = ["google_business_profile", "instagram", "line", "customer_message", "review_reply", "store_pop"];

export default async function ChannelSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeId } = await params;
  const { error } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "external_channel_accounts")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const accounts = await listExternalChannelAccounts(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="外部チャネル設定" description="将来のGoogle、Instagram、LINE連携に備えて、接続予定のアカウントを整理します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <form className="card form" action={upsertExternalChannelAccountAction.bind(null, store.id)}>
        <div className="grid cols-2">
          <label className="field">チャネル
            <select name="channel" defaultValue="google_business_profile">
              {channels.map((channel) => <option key={channel} value={channel}>{growthActionChannelLabel(channel)}</option>)}
            </select>
          </label>
          <label className="field">外部サービス
            <input name="external_provider" defaultValue="google_business_profile" />
          </label>
          <label className="field">アカウント名
            <input name="account_name" placeholder="店舗公式アカウント" required />
          </label>
          <label className="field">外部アカウントID
            <input name="external_account_id" placeholder="将来API連携時に使用" />
          </label>
        </div>
        <label className="field">メモ
          <textarea name="memo" rows={3} placeholder="管理者、運用ルール、接続予定など" />
        </label>
        <div className="form-actions"><button className="button" type="submit">保存</button></div>
      </form>

      <section className="card">
        <h2>登録済みチャネル</h2>
        <table className="table">
          <thead><tr><th>チャネル</th><th>サービス</th><th>アカウント名</th><th>接続状態</th><th>外部ID</th></tr></thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td><span className="badge">{growthActionChannelLabel(account.channel)}</span></td>
                <td>{account.external_provider}</td>
                <td>{account.account_name}</td>
                <td>{account.connection_status === "planned" ? "接続準備中" : account.connection_status}</td>
                <td>{account.external_account_id ?? "-"}</td>
              </tr>
            ))}
            {accounts.length === 0 ? <tr><td colSpan={5}>まだ外部チャネル情報はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
