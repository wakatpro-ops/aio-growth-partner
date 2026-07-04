import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { disconnectGoogleAction } from "../../growth-actions/actions";

const services = [
  { href: "business-profile", label: "Googleビジネスプロフィール", description: "Google検索・マップ向け投稿とロケーション選択の準備" },
  { href: "gmail", label: "Gmail", description: "既存顧客案内メールの下書き作成準備" },
  { href: "calendar", label: "Googleカレンダー", description: "投稿・配信・点検案内の予定作成準備" }
];

export default async function GoogleSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { storeId } = await params;
  const { error, connected } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "google_integrations")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const connectionStatus = googleConnectionStatusLabel(state.connection?.status);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Google連携" description="Googleビジネスプロフィール、Gmail、カレンダーへ安全に連携するための準備画面です。" />
      <StoreBusinessNav store={store} />
      {connected ? <p className="notice success">Google接続を保存しました。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <div className="grid cols-2">
          <div>
            <p className="eyebrow">接続状態</p>
            <h2>{connectionStatus}</h2>
            <p className="muted">接続メール: {state.connection?.email ?? "未取得"}</p>
            <p className="muted">期限: {state.connection?.expires_at ? new Date(state.connection.expires_at).toLocaleString("ja-JP") : "-"}</p>
          </div>
          <div>
            <p className="eyebrow">必要な権限</p>
            <ul className="compact-list">
              {state.scopes.map((scope) => <li key={scope}>{scope}</li>)}
            </ul>
          </div>
        </div>
        {!state.envReady ? <p className="notice danger">VercelにGoogle OAuth環境変数を設定すると接続を開始できます。</p> : null}
        <div className="form-actions">
          <Link className="button" href={`/api/google/oauth/start?storeId=${store.id}`}>Googleに接続</Link>
          <form action={disconnectGoogleAction.bind(null, store.id)}>
            <button className="button secondary" type="submit">接続解除</button>
          </form>
        </div>
      </section>

      <section className="grid cols-3">
        {services.map((service) => (
          <article className="card" key={service.href}>
            <h3>{service.label}</h3>
            <p>{service.description}</p>
            <Link className="button secondary" href={`/stores/${store.id}/settings/google/${service.href}`}>設定を見る</Link>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>最近の連携ログ</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>処理</th><th>状態</th><th>内容</th></tr></thead>
          <tbody>
            {state.logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.created_at).toLocaleString("ja-JP")}</td>
                <td>{log.action_type}</td>
                <td><span className="badge">{log.status}</span></td>
                <td>{log.message ?? "-"}</td>
              </tr>
            ))}
            {state.logs.length === 0 ? <tr><td colSpan={4}>まだGoogle連携ログはありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
