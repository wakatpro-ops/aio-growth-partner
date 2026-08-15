"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDocument } from "@/lib/phase2/business-data";
import {
  approveExpenseReceipt,
  createReceiptFromForm,
  reanalyzeExpenseReceipt,
  updateExpenseReceiptFromForm,
} from "@/lib/phase6/expense-receipts";
import {
  createInvoiceFromOrder,
  createOrderFromEstimate,
  createOrderFromForm,
  createPaymentFromForm,
  markStripeInvoicePaidFromForm,
  updateInvoiceSettingsFromForm,
  updateInvoiceStripePaymentFromForm,
  updateOrderFromForm,
  updateFreeeIntegrationFromForm,
  updateStripeIntegrationFromForm
} from "@/lib/phase6/compliance-data";
import { disconnectFreeeConnect, refreshFreeeMasterOptions } from "@/lib/phase6/freee-connect";
import { sendExpenseReceiptToFreee, sendInvoicesAndPaymentsToFreee } from "@/lib/phase6/freee-connect";
import { disconnectStripeConnect } from "@/lib/phase6/stripe-connect";
import { addOrderItemFromForm, archiveOrderItem, restoreOrderItem } from "@/lib/inventory-operations";

function actionError(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

export async function createOrderAction(storeId: string, formData: FormData) {
  await createOrderFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/orders`);
  redirect(`/stores/${storeId}/orders?saved=order`);
}

export async function createOrderFromEstimateAction(storeId: string, estimateId: string) {
  const estimate = await getDocument(storeId, estimateId, "estimates");
  if (!estimate) throw new Error("見積書が見つかりません。");
  const orderId = await createOrderFromEstimate(storeId, estimate);
  revalidatePath(`/stores/${storeId}/estimates/${estimateId}`);
  revalidatePath(`/stores/${storeId}/orders`);
  redirect(orderId ? `/stores/${storeId}/orders/${orderId}` : `/stores/${storeId}/orders`);
}

export async function updateOrderAction(storeId: string, orderId: string, formData: FormData) {
  try {
    await updateOrderFromForm(storeId, orderId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/orders/${orderId}?error=${actionError(error)}`);
  }
  revalidatePath(`/stores/${storeId}/orders`);
  revalidatePath(`/stores/${storeId}/orders/${orderId}`);
  redirect(`/stores/${storeId}/orders/${orderId}?saved=1`);
}

export async function addOrderItemAction(storeId: string, orderId: string, formData: FormData) {
  try {
    await addOrderItemFromForm(storeId, orderId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/orders/${orderId}?error=${actionError(error)}`);
  }
  revalidatePath(`/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/orders/${orderId}?itemSaved=1`);
}

export async function archiveOrderItemAction(storeId: string, orderId: string, orderItemId: string) {
  try {
    await archiveOrderItem(storeId, orderId, orderItemId);
  } catch (error) {
    redirect(`/stores/${storeId}/orders/${orderId}?error=${actionError(error)}`);
  }
  revalidatePath(`/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/orders/${orderId}?itemDeleted=1`);
}

export async function restoreOrderItemAction(storeId: string, orderId: string, orderItemId: string) {
  try {
    await restoreOrderItem(storeId, orderId, orderItemId);
  } catch (error) {
    redirect(`/stores/${storeId}/orders/${orderId}?error=${actionError(error)}`);
  }
  revalidatePath(`/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/orders/${orderId}?itemRestored=1`);
}

export async function createInvoiceFromOrderAction(storeId: string, orderId: string) {
  const invoiceId = await createInvoiceFromOrder(storeId, orderId);
  revalidatePath(`/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(invoiceId ? `/stores/${storeId}/invoices/${invoiceId}` : `/stores/${storeId}/orders/${orderId}`);
}

export async function createPaymentAction(storeId: string, formData: FormData) {
  await createPaymentFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/payments`);
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/payments?saved=payment`);
}

export async function updateInvoiceSettingsAction(storeId: string, formData: FormData) {
  await updateInvoiceSettingsFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/settings/invoice`);
  redirect(`/stores/${storeId}/settings/invoice?saved=1`);
}

export async function updateStripeIntegrationAction(storeId: string, formData: FormData) {
  await updateStripeIntegrationFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/settings/payments/stripe`);
  revalidatePath(`/stores/${storeId}/settings/integrations`);
  redirect(`/stores/${storeId}/settings/payments/stripe?saved=1`);
}

export async function disconnectStripeIntegrationAction(storeId: string) {
  await disconnectStripeConnect(storeId);
  revalidatePath(`/stores/${storeId}/settings/payments/stripe`);
  revalidatePath(`/stores/${storeId}/settings/integrations`);
  redirect(`/stores/${storeId}/settings/payments/stripe?disconnected=1`);
}

export async function updateFreeeIntegrationAction(storeId: string, formData: FormData) {
  await updateFreeeIntegrationFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/settings/accounting/freee`);
  revalidatePath(`/stores/${storeId}/settings/integrations`);
  redirect(`/stores/${storeId}/settings/accounting/freee?saved=1`);
}

export async function disconnectFreeeIntegrationAction(storeId: string) {
  await disconnectFreeeConnect(storeId);
  revalidatePath(`/stores/${storeId}/settings/accounting/freee`);
  revalidatePath(`/stores/${storeId}/settings/integrations`);
  redirect(`/stores/${storeId}/settings/accounting/freee?disconnected=1`);
}

export async function createExpenseReceiptAction(storeId: string, formData: FormData) {
  let result;
  try {
    result = await createReceiptFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/accounting/receipts/new?error=${actionError(error)}`);
  }
  revalidatePath(`/stores/${storeId}/accounting/receipts`);
  revalidatePath(`/stores/${storeId}/accounting/exports`);
  redirect(`/stores/${storeId}/accounting/receipts/${result.receiptId}?uploaded=1${result.duplicate ? "&duplicate=1" : ""}`);
}

export async function updateExpenseReceiptAction(storeId: string, receiptId: string, formData: FormData) {
  try { await updateExpenseReceiptFromForm(storeId, receiptId, formData); }
  catch (error) { redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?error=${actionError(error)}`); }
  revalidatePath(`/stores/${storeId}/accounting/receipts`);
  revalidatePath(`/stores/${storeId}/accounting/receipts/${receiptId}`);
  redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?saved=1`);
}

export async function approveExpenseReceiptAction(storeId: string, receiptId: string, formData: FormData) {
  try { await approveExpenseReceipt(storeId, receiptId, formData); }
  catch (error) { redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?error=${actionError(error)}`); }
  revalidatePath(`/stores/${storeId}/accounting/receipts`);
  revalidatePath(`/stores/${storeId}/accounting/receipts/${receiptId}`);
  redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?approved=1`);
}

export async function reanalyzeExpenseReceiptAction(storeId: string, receiptId: string) {
  try { await reanalyzeExpenseReceipt(storeId, receiptId); }
  catch (error) { redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?error=${actionError(error)}`); }
  revalidatePath(`/stores/${storeId}/accounting/receipts/${receiptId}`);
  redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?reanalyzed=1`);
}

export async function refreshFreeeMastersAction(storeId: string) {
  try { await refreshFreeeMasterOptions(storeId); }
  catch (error) { redirect(`/stores/${storeId}/settings/accounting/freee?error=${actionError(error)}`); }
  revalidatePath(`/stores/${storeId}/settings/accounting/freee`);
  redirect(`/stores/${storeId}/settings/accounting/freee?masters=1`);
}

export async function sendInvoicesToFreeeAction(storeId: string) {
  const result = await sendInvoicesAndPaymentsToFreee(storeId);
  revalidatePath(`/stores/${storeId}/accounting/exports`);
  redirect(`/stores/${storeId}/accounting/exports?freeeSent=${result.sentCount}&freeeFailed=${result.failedCount}`);
}

export async function sendReceiptToFreeeAction(storeId: string, receiptId: string) {
  try { await sendExpenseReceiptToFreee(storeId, receiptId); }
  catch (error) { redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?error=${actionError(error)}`); }
  revalidatePath(`/stores/${storeId}/accounting/receipts`);
  revalidatePath(`/stores/${storeId}/accounting/exports`);
  revalidatePath(`/stores/${storeId}/accounting/receipts/${receiptId}`);
  redirect(`/stores/${storeId}/accounting/receipts/${receiptId}?freeeReceiptSent=1`);
}

export async function updateInvoiceStripePaymentAction(storeId: string, invoiceId: string, formData: FormData) {
  await updateInvoiceStripePaymentFromForm(storeId, invoiceId, formData);
  revalidatePath(`/stores/${storeId}/invoices/${invoiceId}`);
  revalidatePath(`/stores/${storeId}/payments/stripe-transactions`);
  redirect(`/stores/${storeId}/invoices/${invoiceId}?stripeSaved=1`);
}

export async function markStripeInvoicePaidAction(storeId: string, invoiceId: string, formData: FormData) {
  await markStripeInvoicePaidFromForm(storeId, invoiceId, formData);
  revalidatePath(`/stores/${storeId}/invoices/${invoiceId}`);
  revalidatePath(`/stores/${storeId}/payments`);
  revalidatePath(`/stores/${storeId}/payments/stripe-transactions`);
  redirect(`/stores/${storeId}/invoices/${invoiceId}?paid=1`);
}
