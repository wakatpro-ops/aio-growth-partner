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
import { getInstagramConnectionState } from "@/lib/instagram/service";
import { ProviderConnectButton } from "@/components/ui/provider-connect-button";
import { disconnectInstagramLoginAction, refreshInstagramLoginAction } from "./actions";

const channels: GrowthActionChannel[] = ["google_business_profile", "instagram", "line", "customer_message", "review_reply", "store_pop"];

export default async function ChannelSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; meta_connected?: string; meta_selected?: string; meta_disconnected?: string; meta_test_published?: string; instagram_connected?: string; instagram_disconnected?: string; instagram_refreshed?: string }>;
}) {
  const { storeId } = await params;
  const { error, meta_connected, meta_selected, meta_disconnected, meta_test_published, instagram_connected, instagram_disconnected, instagram_refreshed } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "external_channel_accounts")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const accounts = await listExternalChannelAccounts(store.id);
  const meta = await getMetaConnectionState(store.id);
  const instagram = await getInstagramConnectionState(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="外部サービスを接続" description="この店舗で使うInstagram・Facebookなどを接続します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{error}</p> : null}
      {meta_connected ? <p className="notice success">Meta認証が完了しました。投稿先のFacebookページを選んでください。</p> : null}
      {meta_selected ? <p className="notice success">Facebook経由の投稿先を保存しました。Instagram直接接続は変更していません。</p> : null}
      {meta_disconnected ? <p className="notice success">Meta連携を解除し、保存済みのアクセストークンを削除しました。</p> : null}
      {meta_test_published ? <p className="notice success">審査用FacebookページとInstagramへ接続テスト投稿を公開しました。投稿履歴から公開先を確認できます。</p> : null}
      {instagram_connected ? <p className="notice success">Instagramに直接接続しました。Facebook連携はそのままです。</p> : null}
      {instagram_disconnected ? <p className="notice success">この店舗のInstagram直接接続を解除しました。履歴とFacebook連携は保持しています。</p> : null}
      {instagram_refreshed ? <p className="notice success">Instagramの認証期限を確認・更新しました。接続から24時間以内の場合は、そのままの期限を維持します。</p> : null}

      <section className="card" aria-labelledby="instagram-login-title">
        <h2 id="instagram-login-title">Instagramを接続</h2>
        <p>Instagramのプロアカウント（ビジネス・クリエイター）で接続できます。Facebookページの作成・選択は必要ありません。</p>
        {!instagram.reviewApproved ? <p className="notice">Instagram直接接続は審査準備中です。現在は審査用店舗だけでテストでき、一般店舗への提供はMetaの承認後に開始します。投稿の下書き作成・手動投稿は利用できます。</p> : null}
        {instagram.unavailable ? <p className="notice danger">接続状況を確認できません。時間を置いて再表示してください。</p> : null}
        {instagram.account ? <div className="notice"><strong>{String(instagram.account.account_name)}</strong> · {instagram.account.connection_status === "connected" ? "接続済み（Instagram直接接続）" : instagram.account.connection_status === "expired" ? "認証期限切れ・再接続が必要" : "接続解除済み"}{instagram.account.token_expires_at ? <p className="muted">認証期限：{new Date(String(instagram.account.token_expires_at)).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</p> : null}</div> : meta.accounts.some(account => account.channel === "instagram" && account.connection_status === "connected") ? <p className="notice success">InstagramはFacebook経由で接続済みです。既存の接続は維持しています。</p> : null}
        {instagram.canEdit && instagram.envReady && instagram.allowed ? <div className="form-actions"><ProviderConnectButton href={`/api/instagram/oauth/start?store_id=${encodeURIComponent(store.id)}`}>{instagram.account ? "Instagramを再接続" : "Instagramを接続"}</ProviderConnectButton></div> : null}
        {instagram.canEdit && instagram.allowed && !instagram.envReady ? <p className="notice">運営側の接続設定を準備しています。設定完了後に接続ボタンが表示されます。</p> : null}
        {instagram.canEdit && instagram.account?.connection_status === "connected" ? <div className="form-actions"><form action={refreshInstagramLoginAction.bind(null, store.id)}><PendingSubmitButton className="button secondary" pendingLabel="認証を確認しています…">認証期限を更新</PendingSubmitButton></form><form action={disconnectInstagramLoginAction.bind(null, store.id)}><ConfirmSubmitButton className="button secondary" message="この店舗のInstagram直接接続を解除します。認証情報を削除し、接続・投稿履歴とFacebook連携は残します。解除後はInstagramを再接続するまで直接投稿を停止します。よろしいですか？">Instagramの接続を解除</ConfirmSubmitButton></form></div> : null}
        {instagram.canEdit && instagram.account && instagram.account.connection_status !== "connected" && instagram.account.connection_status !== "disconnected" ? <form action={disconnectInstagramLoginAction.bind(null, store.id)}><ConfirmSubmitButton className="button secondary" message="この店舗のInstagram認証情報を削除します。投稿履歴とFacebook連携は残します。よろしいですか？">期限切れの接続を解除</ConfirmSubmitButton></form> : null}
      </section>

      <section className="card">
        <h2>Facebookページを接続（任意）</h2>
        <p>Facebookに投稿するときはこちらを使います。Facebook経由のInstagram接続も引き続き利用できます。Instagram直接接続の設定は変更しません。</p>
        {instagram.canEdit && meta.envReady ? <div className="form-actions"><ProviderConnectButton href={`/api/meta/oauth/start?store_id=${encodeURIComponent(store.id)}`}>Facebookを接続／再接続</ProviderConnectButton></div> : <p className="notice">Facebookアプリの環境設定が完了すると接続できます。現在もSNS画像・投稿文の作成と手動投稿は利用できます。</p>}
        {instagram.canEdit && meta.candidates.length > 0 ? <form className="form" action={selectMetaPageAction.bind(null, store.id)}><label className="field">投稿先Facebookページ<select name="page_id" required defaultValue=""><option value="" disabled>選択してください</option>{meta.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.instagramId ? "（Instagram接続あり）" : ""}</option>)}</select></label><div className="form-actions"><PendingSubmitButton pendingLabel="投稿先を設定しています...">このページを投稿先に設定</PendingSubmitButton></div></form> : null}
        {meta.accounts.length > 0 ? <div className="table-wrap"><table className="table"><thead><tr><th>媒体</th><th>アカウント</th><th>状態</th><th>認証期限</th></tr></thead><tbody>{meta.accounts.map((account) => <tr key={String(account.id)}><td>{account.channel === "instagram" ? "Instagram（Facebook経由）" : "Facebook"}</td><td>{String(account.account_name ?? "-")}</td><td>{account.connection_status === "connected" ? "接続済み" : String(account.connection_status)}</td><td>{String(account.token_expires_at ?? "-")}</td></tr>)}</tbody></table></div> : null}
        {instagram.canEdit && meta.accounts.filter((account) => ["facebook", "instagram"].includes(String(account.channel)) && account.connection_status === "connected").length === 2 ? <form action={publishMetaReviewTestAction.bind(null, store.id)}><input type="hidden" name="review_test_confirmed" value="yes" /><p className="muted">Meta App Review用の固定画像・固定文だけを、現在選択中の審査用FacebookページとInstagramへ公開します。</p><div className="form-actions"><ConfirmSubmitButton className="button secondary" message="審査用FacebookページとInstagramへ、Meta App Review用の動作確認投稿を実際に公開します。よろしいですか？">審査用の接続テスト投稿を公開</ConfirmSubmitButton></div></form> : null}
        {instagram.canEdit && meta.oauthConnected ? <form action={disconnectMetaAction.bind(null, store.id)}><div className="form-actions"><ConfirmSubmitButton message="Facebook経由の連携を解除します。保存済みのFacebook・Facebook経由Instagramの認証情報を削除します。Instagram直接接続は維持します。よろしいですか？">Facebook経由の連携を解除</ConfirmSubmitButton></div></form> : null}
        <p className="muted"><a href="/data-deletion">Meta連携の解除・データ削除について</a></p>
      </section>

      {instagram.canEdit ? <form className="card form" action={upsertExternalChannelAccountAction.bind(null, store.id)}>
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
        <div className="form-actions"><PendingSubmitButton pendingLabel="外部連携情報を保存しています...">連携メモを保存</PendingSubmitButton></div>
      </form> : null}

      <section className="card">
        <h2>登録済みチャネル</h2>
        <div className="table-wrap"><table className="table">
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
        </table></div>
      </section>
    </AppShell>
  );
}
