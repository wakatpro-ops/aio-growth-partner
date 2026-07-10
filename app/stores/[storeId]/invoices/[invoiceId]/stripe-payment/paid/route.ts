import { redirect } from "next/navigation";
import { markStripeInvoicePaidFromForm } from "@/lib/phase6/compliance-data";

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string; invoiceId: string }> }) {
  const { storeId, invoiceId } = await params;
  const formData = await request.formData();
  await markStripeInvoicePaidFromForm(storeId, invoiceId, formData);
  redirect(`/stores/${storeId}/invoices/${invoiceId}?paid=1`);
}
