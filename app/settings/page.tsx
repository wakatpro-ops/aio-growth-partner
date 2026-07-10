import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { modules } from "@/config/modules";
import { mvpPlans, planForKey } from "@/lib/mvp/status";
import { getMvpWorkspaceSummary } from "@/lib/stores";

export default async function SettingsPage() {
  const summary = await getMvpWorkspaceSummary();
  const currentPlan = planForKey(summary.planKey);

  return (
    <AppShell>
      <PageHeader title="設定" description="MVP運用に必要なモジュール、連携拡張ポイント、プラン制限の下地を確認できます。" />
      <div className="grid cols-2">
        <section className="card">
          <h3>現在のプラン</h3>
          <div className="metric">{currentPlan.name}</div>
          <p>{currentPlan.monthlyPriceLabel}</p>
          <table className="table">
            <tbody>
              <tr><th>店舗数</th><td>{summary.productionStores.length} / {currentPlan.limits.stores}</td></tr>
              <tr><th>AI生成</th><td>{summary.counts.aiLogs} / {currentPlan.limits.aiGenerations}</td></tr>
              <tr><th>CSV取込</th><td>{summary.counts.imports} / {currentPlan.limits.csvImports}</td></tr>
              <tr><th>Google</th><td>{currentPlan.limits.google}</td></tr>
              <tr><th>PDF</th><td>{currentPlan.limits.pdf}</td></tr>
            </tbody>
          </table>
          <p className="muted">Stripeは未接続です。MVPでは管理者が手動でプラン付与する運用を前提にできます。</p>
        </section>
        <section className="card">
          <h3>プラン設計案</h3>
          <table className="table">
            <tbody>
              {Object.entries(mvpPlans).map(([key, plan]) => (
                <tr key={key}>
                  <td><strong>{plan.name}</strong><p className="muted">{plan.monthlyPriceLabel}</p></td>
                  <td>店舗 {plan.limits.stores} / AI {plan.limits.aiGenerations} / CSV {plan.limits.csvImports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>モジュール</h3>
          <table className="table">
            <tbody>
              {modules.map((module) => (
                <tr key={module.key}>
                  <td>{module.name}</td>
                  <td><span className="badge">{module.category}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>将来連携</h3>
          <p>Stripe と freee は Phase 1 では実装せず、billing_integrations と accounting_integrations を拡張ポイントとして用意します。</p>
          <div className="grid">
            <span className="badge">billing_integrations: disabled</span>
            <span className="badge">accounting_integrations: disabled</span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
