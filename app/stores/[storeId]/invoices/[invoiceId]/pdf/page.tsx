import { notFound } from "next/navigation";
import { DocumentPrintView } from "@/components/phase2/document-print-view";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getDocument } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";

export default async function InvoicePdfPage({ params }: { params: Promise<{ storeId: string; invoiceId: string }> }) {
  const { storeId, invoiceId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "pdf_export")) notFound();

  const invoice = await getDocument(store.id, invoiceId, "invoices");
  if (!invoice) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  return <DocumentPrintView document={invoice} industry={industry} kind="invoice" store={store} />;
}
