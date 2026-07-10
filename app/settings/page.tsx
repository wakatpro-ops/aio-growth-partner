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
          <h3>課金と業務連携の分離</h3>
          <p>AIO運営側のStripe課金と、店舗が自分のStripe/freeeを接続する業務連携は別管理です。</p>
          <div className="grid">
            <span className="badge">platform_subscriptions: AIO利用料</span>
            <span className="badge">platform_billing_customers: 運営側Stripe顧客</span>
            <span className="badge">store_payment_integrations: 店舗側Stripe Connect</span>
            <span className="badge">store_accounting_integrations: 店舗側freee等</span>
          </div>
          <p className="muted">店舗側の決済・会計トークンはstore_id / organization_id単位で保存し、AIO運営会社のStripe/freeeとは混ぜません。</p>
        </section>
      </div>
    </AppShell>
  );
}
