import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { betaCautions, betaManualOrPlannedFeatures, betaReadyFeatures, getBetaAdminSummary, getStoreBetaChecklist } from "@/lib/mvp/release-prep";
import { storeDataModeLabel } from "@/lib/mvp/status";

function integrationStatus(items: Array<Record<string, unknown>>, storeId: string, provider?: string) {
  const item = items.find((candidate) => String(candidate.store_id ?? "") === storeId && (!provider || String(candidate.provider ?? "") === provider));
  return String(item?.status ?? "未設定");
}

export default async function AdminBetaReleasePage() {
  const summary = await getBetaAdminSummary();
  const checklists = await Promise.all(summary.stores.map(async (store) => ({
    store,
    items: await getStoreBetaChecklist(store)
  })));

  return (
    <AppShell>
      <PageHeader
        eyebrow="MVP Release"
        title="βリリース運用"
        description="伴走ありで実店舗に触ってもらう前に、店舗状態、連携状態、エラー、チェックリストを確認します。"
        action={<Link className="button" href="/onboarding">初回導入を見る</Link>}
      />

      <section className="grid cols-4">
        <article className="card"><p className="muted">登録ユーザー</p><div className="metric">{summary.counts.userProfiles.toLocaleString("ja-JP")}</div></article>
        <article className="card"><p className="muted">組織</p><div className="metric">{summary.counts.organizations.toLocaleString("ja-JP")}</div></article>
        <article className="card"><p className="muted">実店舗</p><div className="metric">{summary.counts.productionStores.toLocaleString("ja-JP")}</div></article>
        <article className="card"><p className="muted">デモ店舗</p><div className="metric">{summary.counts.demoStores.toLocaleString("ja-JP")}</div></article>
      </section>

      <section className="grid cols-3">
        <article className="card"><p className="muted">AI利用</p><div className="metric">{summary.counts.aiLogs.toLocaleString("ja-JP")}</div><p>エラー {summary.counts.aiErrors.toLocaleString("ja-JP")}件</p></article>
        <article className="card"><p className="muted">CSV取込</p><div className="metric">{summary.counts.imports.toLocaleString("ja-JP")}</div><p>取込エラー行 {summary.counts.importErrors.toLocaleString("ja-JP")}件</p></article>
        <article className="card"><p className="muted">外部連携エラー</p><div className="metric">{summary.counts.externalErrors.toLocaleString("ja-JP")}</div><p>Google、Gmail、Calendarなどの連携ログを確認します。</p></article>
      </section>

      <section className="card">
        <h2>店舗別状態</h2>
        <table className="table">
          <thead>
            <tr>
              <th>店舗</th>
              <th>区分</th>
              <th>業態</th>
              <th>Google</th>
              <th>Stripe</th>
              <th>freee</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {summary.stores.map((store) => {
              const industry = getIndustryConfig(store.industry_type_key);
              const google = summary.googleConnections.find((item) => String(item.store_id ?? "") === store.id);
              return (
                <tr key={store.id}>
                  <td><strong>{store.name}</strong></td>
                  <td><span className="badge">{storeDataModeLabel(store)}</span></td>
                  <td>{industry.name}</td>
                  <td>{String(google?.status ?? "未接続")}</td>
                  <td>{integrationStatus(summary.paymentIntegrations, store.id, "stripe")}</td>
                  <td>{integrationStatus(summary.accountingIntegrations, store.id, "freee")}</td>
                  <td><Link className="button secondary" href={`/onboarding?storeId=${store.id}`}>導入確認</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>βチェックリスト</h2>
        <table className="table">
          <thead><tr><th>店舗</th><th>進捗</th><th>未確認項目</th></tr></thead>
          <tbody>
            {checklists.map(({ store, items }) => {
              const done = items.filter((item) => item.done).length;
              const missing = items.filter((item) => !item.done).map((item) => item.label);
              return (
                <tr key={store.id}>
                  <td>{store.name}</td>
                  <td>{done} / {items.length}</td>
                  <td>{missing.length > 0 ? missing.join("、") : "すべてOK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>β版でできること</h2>
          <div className="grid">
            {betaReadyFeatures.map((feature) => <span className="badge badge-strong" key={feature}>{feature}</span>)}
          </div>
        </article>
        <article className="card">
          <h2>準備中 / 手動支援モード</h2>
          <div className="grid">
            {betaManualOrPlannedFeatures.map((feature) => <span className="badge" key={feature}>{feature}</span>)}
          </div>
        </article>
      </section>

      <section className="card">
        <h2>直近の操作ログ</h2>
        <table className="table">
          <thead><tr><th>日時</th><th>店舗ID</th><th>操作</th><th>対象</th><th>内容</th></tr></thead>
          <tbody>
            {summary.auditLogs.map((log) => (
              <tr key={String(log.id)}>
                <td>{new Date(String(log.created_at ?? "")).toLocaleString("ja-JP")}</td>
                <td>{String(log.store_id ?? "-")}</td>
                <td>{String(log.action_type ?? "-")}</td>
                <td>{String(log.target_type ?? "-")}</td>
                <td>{String(log.message ?? "-")}</td>
              </tr>
            ))}
            {summary.auditLogs.length === 0 ? <tr><td colSpan={5}>まだ操作ログはありません。</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>ユーザーに説明する注意点</h2>
        <ul className="compact-list">
          {betaCautions.map((caution) => <li key={caution}>{caution}</li>)}
        </ul>
      </section>
    </AppShell>
  );
}
