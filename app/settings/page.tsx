import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { modules } from "@/config/modules";
import { betaCautions, betaManualOrPlannedFeatures, betaReadyFeatures } from "@/lib/mvp/release-prep";
import { mvpPlans, planForKey } from "@/lib/mvp/status";
import { getMvpWorkspaceSummary } from "@/lib/stores";

export default async function SettingsPage() {
  const summary = await getMvpWorkspaceSummary();
  const currentPlan = planForKey(summary.planKey);

  return (
    <AppShell>
      <PageHeader title="設定" description="利用中のプラン、機能、外部連携、規約・ヘルプを確認できます。" />
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
          <p className="muted">プラン内容や利用上限は、契約内容に応じて設定されます。</p>
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
          <h3>外部連携</h3>
          <p>店舗で利用するStripe決済URLやfreee向けCSV出力など、業務に使う連携情報を管理します。</p>
          <div className="grid">
            <span className="badge">Stripe決済URL</span>
            <span className="badge">freee向けCSV</span>
            <span className="badge">Google連携</span>
            <span className="badge">SNS投稿支援</span>
          </div>
          <p className="muted">外部サービスへ反映する前に、店舗担当者が内容を確認して利用します。</p>
        </section>
        <section className="card">
          <h3>利用できること</h3>
          <div className="grid">
            {betaReadyFeatures.map((feature) => <span className="badge badge-strong" key={feature}>{feature}</span>)}
          </div>
        </section>
        <section className="card">
          <h3>確認しながら使う機能</h3>
          <div className="grid">
            {betaManualOrPlannedFeatures.map((feature) => <span className="badge" key={feature}>{feature}</span>)}
          </div>
          <ul className="compact-list">
            {betaCautions.map((caution) => <li key={caution}>{caution}</li>)}
          </ul>
        </section>
        <section className="card">
          <h3>規約・ヘルプ</h3>
          <p>利用規約、プライバシーポリシー、操作方法、利用時の注意事項を確認できます。</p>
          <div className="button-row">
            <Link className="button secondary" href="/legal">規約・ポリシー</Link>
            <Link className="button secondary" href="/help">操作方法</Link>
            <Link className="button secondary" href="/beta-notes">利用時の注意事項</Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
