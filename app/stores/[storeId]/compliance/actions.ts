"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDocument } from "@/lib/phase2/business-data";
import {
  createInvoiceFromOrder,
  createOrderFromEstimate,
  createOrderFromForm,
  createPaymentFromForm,
  updateInvoiceSettingsFromForm,
  updateOrderFromForm
} from "@/lib/phase6/compliance-data";

export async function createOrderAction(storeId: string, formData: FormData) {
  await createOrderFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/orders`);
  redirect(`/stores/${storeId}/orders`);
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
  await updateOrderFromForm(storeId, orderId, formData);
  revalidatePath(`/stores/${storeId}/orders`);
  revalidatePath(`/stores/${storeId}/orders/${orderId}`);
  redirect(`/stores/${storeId}/orders/${orderId}?saved=1`);
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
  redirect(`/stores/${storeId}/payments`);
}

export async function updateInvoiceSettingsAction(storeId: string, formData: FormData) {
  await updateInvoiceSettingsFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/settings/invoice`);
  redirect(`/stores/${storeId}/settings/invoice?saved=1`);
}
