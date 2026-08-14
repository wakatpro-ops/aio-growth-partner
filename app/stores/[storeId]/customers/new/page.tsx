import { AppShell } from "@/components/layout/app-shell";
import { CustomerForm } from "@/components/phase2/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { createCustomerAction } from "../../business/actions";

export default async function NewCustomerPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={`${industry.businessLabels.customer}を追加`} description="見積・請求と再来店支援に使う顧客情報を登録します。" />
      <CustomerForm action={createCustomerAction.bind(null, store.id)} showVehicle={store.industry_type_key === "auto_repair"} cancelHref={`/stores/${store.id}/customers`} />
    </AppShell>
  );
}
