import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { createInvoiceAction } from "../../business/actions";

export default async function NewInvoicePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const customers = await listCustomers(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={`${industry.businessLabels.invoice}を追加`} description="発行日、支払期限、請求金額を登録します。" />
      <DocumentForm action={createInvoiceAction.bind(null, store.id)} customers={customers} kind="invoice" />
    </AppShell>
  );
}
