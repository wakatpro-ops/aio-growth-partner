import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getDocument } from "@/lib/phase2/business-data";
import { createBusinessDocumentPdf } from "@/lib/phase2/pdf-document";
import { getStore } from "@/lib/stores";

export async function GET(_: Request, { params }: { params: Promise<{ storeId: string; invoiceId: string }> }) {
  const { storeId, invoiceId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "pdf_export")) {
    return new Response("Not found", { status: 404 });
  }

  const invoice = await getDocument(store.id, invoiceId, "invoices");
  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  const industry = getIndustryConfig(store.industry_type_key);
  const pdf = createBusinessDocumentPdf({ document: invoice, industry, kind: "invoice", store });
  const fileName = encodeURIComponent(`${invoice.document_number}.pdf`);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`
    }
  });
}
