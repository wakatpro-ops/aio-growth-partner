import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentForm } from "@/components/phase2/document-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getDocument, listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { deleteInvoiceAction, updateInvoiceAction } from "../../business/actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ storeId: string; invoiceId: string }> }) {
  const { storeId, invoiceId } = await params;
  const store = await getStore(storeId);
  const [invoice, customers] = await Promise.all([
    getDocument(store.id, invoiceId, "invoices"),
    listCustomers(store.id)
  ]);
  if (!invoice) notFound();

  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={invoice.title} description={`${industry.businessLabels.invoice}を編集します。`} />
      <DocumentForm action={updateInvoiceAction.bind(null, store.id, invoice.id)} document={invoice} customers={customers} kind="invoice" />
      <form action={deleteInvoiceAction.bind(null, store.id, invoice.id)} className="danger-zone">
        <button className="button danger" type="submit">削除</button>
      </form>
    </AppShell>
  );
}
