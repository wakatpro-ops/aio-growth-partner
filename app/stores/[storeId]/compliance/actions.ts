"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDocument } from "@/lib/phase2/business-data";
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
import { disconnectFreeeConnect } from "@/lib/phase6/freee-connect";
import { disconnectStripeConnect } from "@/lib/phase6/stripe-connect";

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
