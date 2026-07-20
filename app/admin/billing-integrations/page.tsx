import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";

const sections = [
  {
    title: "AIO運営側の課金",
    description: "AIO boostの利用料を店舗から徴収するためのStripeです。AIO運営会社のStripeアカウントを使います。",
    tables: ["plans", "plan_limits", "platform_billing_customers", "platform_subscriptions"]
  },
  {
    title: "店舗側のStripe決済連携",
    description: "各店舗が自分のStripeアカウントを接続し、店舗のお客様から決済を受けるための領域です。将来はStripe Connectを前提にします。",
    tables: ["store_payment_integrations", "store_payment_transactions", "payments", "invoices"]
  },
  {
    title: "店舗側の会計連携",
    description: "各店舗が自分のfreee、マネーフォワード等の事業所を接続し、売上・請求・入金データを送るための領域です。",
    tables: ["store_accounting_integrations", "accounting_export_jobs", "accounting_exports"]
  }
];

export default function AdminBillingIntegrationsPage() {
  return (
    <AppShell>
      <PageHeader
        title="課金・外部連携分離"
        description="AIO運営側のSaaS課金と、店舗側のStripe/freee業務連携を混同しないための確認画面です。"
      />
      <p className="notice">
        AIO運営会社のStripe/freeeと、店舗ユーザー自身のStripe/freeeは別物として扱います。正式課金前に、この分離を保ったまま実装を進めます。
      </p>
      <div className="grid cols-3">
        {sections.map((section) => (
          <section className="card" key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.description}</p>
            <ul className="compact-list">
              {section.tables.map((table) => <li key={table}><code>{table}</code></li>)}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
