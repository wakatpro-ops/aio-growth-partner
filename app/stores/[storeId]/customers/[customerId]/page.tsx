import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CustomerForm } from "@/components/phase2/customer-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getCustomer } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { deleteCustomerAction, updateCustomerAction } from "../../business/actions";

export default async function CustomerDetailPage({ params }: { params: Promise<{ storeId: string; customerId: string }> }) {
  const { storeId, customerId } = await params;
  const store = await getStore(storeId);
  const customer = await getCustomer(store.id, customerId);
  if (!customer) notFound();

  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={customer.name} description={`${industry.businessLabels.customer}情報を編集します。`} />
      <CustomerForm action={updateCustomerAction.bind(null, store.id, customer.id)} customer={customer} showVehicle={store.industry_type_key === "auto_repair"} />
      <form action={deleteCustomerAction.bind(null, store.id, customer.id)} className="danger-zone">
        <button className="button danger" type="submit">削除</button>
      </form>
    </AppShell>
  );
}
