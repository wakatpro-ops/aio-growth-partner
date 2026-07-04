import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getDocument, listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { deleteEstimateAction, updateEstimateAction } from "../../business/actions";

export default async function EstimateDetailPage({ params }: { params: Promise<{ storeId: string; estimateId: string }> }) {
  const { storeId, estimateId } = await params;
  const store = await getStore(storeId);
  const [estimate, customers] = await Promise.all([
    getDocument(store.id, estimateId, "estimates"),
    listCustomers(store.id)
  ]);
  if (!estimate) notFound();

  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={estimate.title} description={`${industry.businessLabels.estimate}を編集します。`} />
      <DocumentForm action={updateEstimateAction.bind(null, store.id, estimate.id)} document={estimate} customers={customers} kind="estimate" />
      <form action={deleteEstimateAction.bind(null, store.id, estimate.id)} className="danger-zone">
        <button className="button danger" type="submit">削除</button>
      </form>
    </AppShell>
  );
}
