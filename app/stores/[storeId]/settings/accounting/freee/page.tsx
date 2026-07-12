import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { freeeRedirectUri, isFreeeConnectEnvReady } from "@/lib/phase6/freee-connect";
import { getStoreAccountingIntegration } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { integrationStatusLabels, labelFor } from "@/lib/status-labels";
import { disconnectFreeeIntegrationAction, updateFreeeIntegrationAction } from "../../../compliance/actions";

export default async function FreeeSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string; connected?: string; disconnected?: string; error?: string }> }) {
  const { storeId } = await params;
  const { saved, connected, disconnected, error } = await searchParams;
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const industry = getIndustryConfig(store.industry_type_key);
  const integration = await getStoreAccountingIntegration(store.id, "freee");
  const config = integration?.config ?? {};
  const metadata = integration?.metadata ?? {};
  const redirectUri = freeeRedirectUri();
  const connectEnvReady = isFreeeConnectEnvReady();
  const isConnected = integration?.status === "connected";
  const isPlatformAdmin = Boolean(access?.isPlatformAdmin);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="freee会計設定" description="店舗のfreee事業所接続と、会計ソフトに取り込むCSV出力を管理します。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">freee連携情報を保存しました。</p> : null}
      {connected ? <p className="notice success">freee事業所を接続しました。会計CSV出力や今後の会計連携に利用できます。</p> : null}
      {disconnected ? <p className="notice success">freee接続を解除しました。</p> : null}
      {error ? <p className="notice danger">{error}</p> : null}
      <section className="grid cols-2">
        <article className="card">
          <h2>freee事業所接続</h2>
          <p>この店舗が使っているfreee事業所を接続し、請求・入金・売上データを会計処理へつなげやすくします。</p>
          <p className="notice">
            接続時にfreee側で事業所を選択します。AIOは選択されたこの店舗の事業所情報だけを保存します。
          </p>
          <dl className="definition-list">
            <div>
              <dt>接続状態</dt>
              <dd><span className="badge">{labelFor(integrationStatusLabels, integration?.status)}</span></dd>
            </div>
            <div>
              <dt>freee事業所ID</dt>
              <dd>{integration?.external_company_id ?? "未接続"}</dd>
            </div>
            <div>
              <dt>事業所名</dt>
              <dd>{integration?.office_name ?? "未取得"}</dd>
            </div>
            <div>
              <dt>最終確認</dt>
              <dd>{integration?.last_synced_at ? new Date(integration.last_synced_at).toLocaleString("ja-JP") : "未確認"}</dd>
            </div>
          </dl>
          <div className="actions-row">
            {connectEnvReady ? (
              <Link className="button" href={`/api/freee/oauth/start?storeId=${store.id}`}>
                {isConnected ? "freee事業所を変更する" : "自分のfreee事業所を接続"}
              </Link>
            ) : (
              <button className="button" type="button" disabled>freee接続準備中</button>
            )}
            {isConnected ? (
              <form action={disconnectFreeeIntegrationAction.bind(null, store.id)}>
                <PendingSubmitButton className="button secondary" pendingLabel="接続を解除しています...">接続を解除</PendingSubmitButton>
              </form>
            ) : null}
          </div>
          {!connectEnvReady ? (
            <p className="notice">freee接続を使うには、管理者がfreeeの接続設定を完了する必要があります。</p>
          ) : null}
        </article>
        {isPlatformAdmin ? (
          <article className="card">
            <h2>管理者向け設定URL</h2>
            <p>freeeアプリのコールバックURLには以下を登録します。</p>
            <p className="mono-block">{redirectUri ?? "https://app.aioboost.jp/api/freee/oauth/callback"}</p>
            <CopyButton value={redirectUri ?? "https://app.aioboost.jp/api/freee/oauth/callback"} label="URLをコピー" />
            <p className="muted">freee公式の事業所選択画面を使い、店舗ごとに1つの事業所を接続します。</p>
          </article>
        ) : (
          <article className="card">
            <h2>接続前に確認すること</h2>
            <ul className="compact-list">
              <li>店舗オーナー本人、または会計管理者のfreeeでログインしてください。</li>
              <li>複数の事業所を管理している場合は、この店舗で使う事業所を選んでください。</li>
              <li>接続後も、会計CSV出力は引き続き利用できます。</li>
              <li>会計処理の内容は、必要に応じて税理士・会計担当者と確認してください。</li>
            </ul>
          </article>
        )}
      </section>
      <section className="card form">
        <h2>freee事業所情報の手動管理</h2>
        <p>freee接続前、または事業所情報だけ先に控えておきたい場合に利用します。</p>
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
      {isPlatformAdmin ? (
        <section className="card">
          <h2>管理者向け接続メモ</h2>
          <dl className="definition-list">
            <div>
              <dt>接続方式</dt>
              <dd>{typeof metadata.connected_via === "string" ? metadata.connected_via : "未接続"}</dd>
            </div>
            <div>
              <dt>token保存</dt>
              <dd>{typeof metadata.access_token_storage === "string" ? metadata.access_token_storage : "未保存"}</dd>
            </div>
            <div>
              <dt>事業所数</dt>
              <dd>{typeof metadata.companies_returned === "number" ? `${metadata.companies_returned}件` : "未確認"}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </AppShell>
  );
}
