import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStorePaymentIntegration } from "@/lib/phase6/compliance-data";
import { isStripeConnectEnvReady, stripeRedirectUri } from "@/lib/phase6/stripe-connect";
import { getStore } from "@/lib/stores";
import { integrationStatusLabels, labelFor } from "@/lib/status-labels";
import { disconnectStripeIntegrationAction, updateStripeIntegrationAction } from "../../../compliance/actions";

export default async function StripeSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string; connected?: string; disconnected?: string; error?: string }> }) {
  const { storeId } = await params;
  const { saved, connected, disconnected, error } = await searchParams;
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const industry = getIndustryConfig(store.industry_type_key);
  const integration = await getStorePaymentIntegration(store.id, "stripe");
  const config = integration?.config ?? {};
  const metadata = integration?.metadata ?? {};
  const redirectUri = stripeRedirectUri();
  const connectEnvReady = isStripeConnectEnvReady();
  const isConnected = integration?.status === "connected";
  const isPlatformAdmin = Boolean(access?.isPlatformAdmin);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Stripe決済設定" description="店舗のStripeアカウント接続と、請求書の決済URL・入金状況を管理します。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">Stripe連携情報を保存しました。</p> : null}
      {connected ? <p className="notice success">Stripeアカウントを接続しました。請求書の決済URL登録や入金管理に利用できます。</p> : null}
      {disconnected ? <p className="notice success">Stripe接続を解除しました。</p> : null}
      {error ? <p className="notice danger">{error}</p> : null}
      <section className="grid cols-2">
        <article className="card">
          <h2>Stripe Connect</h2>
          <p>この店舗が自分のStripeアカウントで決済を受け、AIOでは請求書・入金状況と連動して管理します。</p>
          <p className="notice">
            接続するのは、この店舗で実際に使うStripeアカウントです。接続後は、この店舗の請求書と入金管理に反映されます。
          </p>
          <dl className="definition-list">
            <div>
              <dt>接続状態</dt>
              <dd><span className="badge">{labelFor(integrationStatusLabels, integration?.status)}</span></dd>
            </div>
            <div>
              <dt>接続アカウント</dt>
              <dd>{integration?.external_account_id ?? "未接続"}</dd>
            </div>
            <div>
              <dt>アカウント名</dt>
              <dd>{integration?.account_name ?? "未取得"}</dd>
            </div>
            <div>
              <dt>決済受付</dt>
              <dd>{integration?.charges_enabled ? "有効" : "未確認"}</dd>
            </div>
            <div>
              <dt>入金</dt>
              <dd>{integration?.payouts_enabled ? "有効" : "未確認"}</dd>
            </div>
          </dl>
          <div className="actions-row">
            {connectEnvReady ? (
              <Link className="button" href={`/api/stripe/oauth/start?storeId=${store.id}`}>
                {isConnected ? "店舗のStripeを変更する" : "自分のStripeアカウントを接続"}
              </Link>
            ) : (
              <button className="button" type="button" disabled>Stripe接続準備中</button>
            )}
            {isConnected ? (
              <form action={disconnectStripeIntegrationAction.bind(null, store.id)}>
                <PendingSubmitButton className="button secondary" pendingLabel="接続を解除しています...">接続を解除</PendingSubmitButton>
              </form>
            ) : null}
          </div>
          {!connectEnvReady ? (
            <p className="notice">Stripe接続を使うには、管理者がStripeの接続設定を完了する必要があります。</p>
          ) : null}
        </article>
        {isPlatformAdmin ? (
          <article className="card">
            <h2>管理者向け設定URL</h2>
            <p>Stripe ConnectのリダイレクトURLには以下を登録します。</p>
            <p className="mono-block">{redirectUri ?? "https://app.aioboost.jp/api/stripe/oauth/callback"}</p>
            <CopyButton value={redirectUri ?? "https://app.aioboost.jp/api/stripe/oauth/callback"} label="URLをコピー" />
            <p className="muted">接続方式は、店舗が直接決済を受けるダイレクト支払い型です。</p>
          </article>
        ) : (
          <article className="card">
            <h2>接続前に確認すること</h2>
            <ul className="compact-list">
              <li>店舗オーナー本人、または決済管理者のStripeでログインしてください。</li>
              <li>まだStripeアカウントがない場合は、Stripe画面で新しく作成できます。</li>
              <li>複数のStripeアカウントを管理している場合は、この店舗で使うアカウントを選んでください。</li>
              <li>接続後は、この店舗の請求書と入金管理に反映されます。</li>
            </ul>
          </article>
        )}
      </section>
      {isPlatformAdmin ? (
        <section className="card form">
          <h2>管理者向け手動連携情報</h2>
          <p>Stripe Connectを使わない場合や、移行期間中に管理者がアカウント情報を補助管理します。</p>
          <form action={updateStripeIntegrationAction.bind(null, store.id)} className="grid cols-2">
            <div className="field">
              <label htmlFor="status">接続状態</label>
              <select id="status" name="status" defaultValue={integration?.status ?? "manual_ready"}>
                <option value="not_connected">未接続</option>
                <option value="manual_ready">手動連携で運用中</option>
                <option value="connected">接続済み</option>
                <option value="disconnected">未接続</option>
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
      ) : null}
      {metadata && typeof metadata === "object" && "connected_via" in metadata ? (
        <section className="card">
          <h2>接続メモ</h2>
          <ul className="compact-list">
            <li>接続方式: Stripe Connect</li>
            <li>決済フロー: 店舗が直接決済を受ける方式</li>
            <li>接続日時: {integration?.connected_at ? new Date(integration.connected_at).toLocaleString("ja-JP") : "未接続"}</li>
          </ul>
        </section>
      ) : null}
      <section className="card">
        <h2>この画面でできること</h2>
        <ul className="compact-list">
          <li>店舗自身のStripeアカウントを接続できます。</li>
          <li>請求書ごとにStripe決済URLを登録できます。</li>
          <li>Stripeで決済済みになった請求書を、AIO上で入金済みとして記録できます。</li>
          <li>外部決済履歴を残し、入金管理で確認できます。</li>
        </ul>
      </section>
    </AppShell>
  );
}
