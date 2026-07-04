import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { createEstimateAction } from "../../business/actions";

export default async function NewEstimatePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const customers = await listCustomers(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={`${industry.businessLabels.estimate}を追加`} description="発行日、顧客、金額を登録します。" />
      <DocumentForm action={createEstimateAction.bind(null, store.id)} customers={customers} kind="estimate" />
    </AppShell>
  );
}
