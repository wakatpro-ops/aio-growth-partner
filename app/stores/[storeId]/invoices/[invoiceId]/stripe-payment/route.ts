import { redirect } from "next/navigation";
import { updateInvoiceStripePaymentFromForm } from "@/lib/phase6/compliance-data";

export async function POST(request: Request, { params }: { params: Promise<{ storeId: string; invoiceId: string }> }) {
  const { storeId, invoiceId } = await params;
  const formData = await request.formData();
  try {
    await updateInvoiceStripePaymentFromForm(storeId, invoiceId, formData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存処理でエラーが発生しました。";
    redirect(`/stores/${storeId}/invoices/${invoiceId}?stripeError=${encodeURIComponent(message)}`);
  }
  redirect(`/stores/${storeId}/invoices/${invoiceId}?stripeSaved=1`);
}
