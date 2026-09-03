import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { growthActionChannelLabel, listExternalChannelAccounts } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { disconnectMetaAction, publishMetaReviewTestAction, selectMetaPageAction, upsertExternalChannelAccountAction } from "../../growth-actions/actions";
import type { GrowthActionChannel } from "@/types/phase5";
import { getMetaConnectionState } from "@/lib/phase5/sns-publishing";

const channels: GrowthActionChannel[] = ["google_business_profile", "instagram", "line", "customer_message", "review_reply", "store_pop"];

export default async function ChannelSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; meta_connected?: string; meta_selected?: string; meta_disconnected?: string; meta_test_published?: string }>;
}) {
  const { storeId } = await params;
  const { error, meta_connected, meta_selected, meta_disconnected, meta_test_published } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "external_channel_accounts")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const accounts = await listExternalChannelAccounts(store.id);
  const meta = await getMetaConnectionState(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="外部チャネル設定" description="将来のGoogle、Instagram、LINE連携に備えて、接続予定のアカウントを整理します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}
      {meta_connected ? <p className="notice success">Meta認証が完了しました。投稿先のFacebookページを選んでください。</p> : null}
      {meta_selected ? <p className="notice success">Facebook・Instagramの投稿先を保存しました。</p> : null}
      {meta_disconnected ? <p className="notice success">Meta連携を解除し、保存済みのアクセストークンを削除しました。</p> : null}
      {meta_test_published ? <p className="notice success">審査用FacebookページとInstagramへ接続テスト投稿を公開しました。投稿履歴から公開先を確認できます。</p> : null}

      <section className="card">
        <h2>Instagram・Facebook直接投稿</h2>
        <p>Metaへログインしたあと、実際に使うFacebookページを自分で選択します。AIO boostが勝手に最初のページを選ぶことはありません。</p>
        {meta.envReady ? <div className="form-actions"><a className="button" href={`/api/meta/oauth/start?store_id=${encodeURIComponent(store.id)}`}>Metaへ接続／再接続</a></div> : <p className="notice">Metaアプリの環境設定が完了すると接続できます。現在もSNS画像・投稿文の作成と手動投稿は利用できます。</p>}
        {meta.candidates.length > 0 ? <form className="form" action={selectMetaPageAction.bind(null, store.id)}><label className="field">投稿先Facebookページ<select name="page_id" required defaultValue=""><option value="" disabled>選択してください</option>{meta.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.instagramId ? "（Instagram接続あり）" : ""}</option>)}</select></label><div className="form-actions"><PendingSubmitButton pendingLabel="投稿先を設定しています...">このページを投稿先に設定</PendingSubmitButton></div></form> : null}
        {meta.accounts.length > 0 ? <div className="table-wrap"><table className="table"><thead><tr><th>媒体</th><th>アカウント</th><th>状態</th><th>認証期限</th></tr></thead><tbody>{meta.accounts.map((account) => <tr key={String(account.id)}><td>{String(account.channel)}</td><td>{String(account.account_name ?? "-")}</td><td>{account.connection_status === "connected" ? "接続済み" : String(account.connection_status)}</td><td>{String(account.token_expires_at ?? "-")}</td></tr>)}</tbody></table></div> : null}
        {meta.accounts.filter((account) => ["facebook", "instagram"].includes(String(account.channel)) && account.connection_status === "connected").length === 2 ? <form action={publishMetaReviewTestAction.bind(null, store.id)}><input type="hidden" name="review_test_confirmed" value="yes" /><p className="muted">Meta App Review用の固定画像・固定文だけを、現在選択中の審査用FacebookページとInstagramへ公開します。</p><div className="form-actions"><ConfirmSubmitButton className="button secondary" message="審査用FacebookページとInstagramへ、Meta App Review用の動作確認投稿を実際に公開します。よろしいですか？">審査用の接続テスト投稿を公開</ConfirmSubmitButton></div></form> : null}
        {meta.oauthConnected ? <form action={disconnectMetaAction.bind(null, store.id)}><div className="form-actions"><ConfirmSubmitButton message="Meta連携を解除します。AIO boostに保存されたFacebook・Instagram用アクセストークンは削除され、直接投稿を利用できなくなります。よろしいですか？">Meta連携を解除</ConfirmSubmitButton></div></form> : null}
        <p className="muted"><a href="/data-deletion">Meta連携の解除・データ削除について</a></p>
      </section>

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
        <div className="form-actions"><PendingSubmitButton pendingLabel="外部連携情報を保存しています...">保存</PendingSubmitButton></div>
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
