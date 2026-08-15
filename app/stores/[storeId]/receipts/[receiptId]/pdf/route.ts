import { createPaymentReceiptPdf } from "@/lib/phase6/payment-receipt-pdf";
import { getPaymentReceiptDocument, recordPaymentReceiptIssue } from "@/lib/phase6/stripe-payments";

export async function GET(request: Request, { params }: { params: Promise<{ storeId: string; receiptId: string }> }) {
  const { storeId, receiptId } = await params;
  const receipt = await getPaymentReceiptDocument(storeId, receiptId);
  if (!receipt) return new Response("Not found", { status: 404 });
  const reason = new URL(request.url).searchParams.get("reissueReason");
  await recordPaymentReceiptIssue(storeId, receiptId, reason);
  const bytes = createPaymentReceiptPdf({ receiptNumber: receipt.receipt_number, issuedAt: receipt.original_issued_at,
    amount: Number(receipt.amount), issuedTo: receipt.issued_to ?? "お客様", storeName: receipt.store?.name ?? "店舗",
    storeAddress: receipt.store?.address, invoiceNumber: receipt.invoice?.document_number ?? "", title: receipt.invoice?.title ?? "お支払い",
    paymentMethod: receipt.payment_method, status: receipt.status, reissueReason: reason,
    registrationNumber: receipt.invoice?.invoice_registration_number,
    tax10Subtotal: Number(receipt.invoice?.tax_10_subtotal ?? 0), tax10Amount: Number(receipt.invoice?.tax_10_amount ?? receipt.invoice?.tax_total ?? 0),
    tax8Subtotal: Number(receipt.invoice?.tax_8_subtotal ?? 0), tax8Amount: Number(receipt.invoice?.tax_8_amount ?? 0) });
  const fileName = encodeURIComponent(`${receipt.receipt_number}.pdf`);
  return new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename*=UTF-8''${fileName}`, "cache-control": "private, no-store" } });
}
