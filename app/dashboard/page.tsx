import { IndustryDashboard } from "@/components/dashboard/industry-dashboard";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listStores } from "@/lib/stores";

export default async function DashboardPage() {
  const stores = await listStores();
  const store = stores[0];
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.dashboardTitle}
        description={`${store.name} の業態設定に合わせて、表示カードと機能が切り替わります。`}
      />
      <IndustryDashboard store={store} />
    </AppShell>
  );
}
