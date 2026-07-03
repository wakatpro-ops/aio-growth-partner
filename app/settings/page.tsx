import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { modules } from "@/config/modules";

export default function SettingsPage() {
  return (
    <AppShell>
      <PageHeader title="設定" description="Phase 1ではモジュール、連携拡張ポイント、プラン制限の設計を確認できます。" />
      <div className="grid cols-2">
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
