"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomerFromForm,
  createDocumentFromForm,
  createItemFromForm,
  deleteCustomer,
  deleteDocument,
  deleteItem,
  updateCustomerFromForm,
  updateDocumentFromForm,
  updateItemFromForm,
  updateStockFromForm
} from "@/lib/phase2/business-data";

export async function createItemAction(storeId: string, formData: FormData) {
  await createItemFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/items`);
  redirect(`/stores/${storeId}/items`);
}

export async function updateItemAction(storeId: string, itemId: string, formData: FormData) {
  await updateItemFromForm(storeId, itemId, formData);
  revalidatePath(`/stores/${storeId}/items`);
  redirect(`/stores/${storeId}/items/${itemId}`);
}

export async function deleteItemAction(storeId: string, itemId: string) {
  await deleteItem(storeId, itemId);
  revalidatePath(`/stores/${storeId}/items`);
  redirect(`/stores/${storeId}/items`);
}

export async function updateStockAction(storeId: string, formData: FormData) {
  await updateStockFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/inventory`);
}

export async function createCustomerAction(storeId: string, formData: FormData) {
  await createCustomerFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/customers`);
  redirect(`/stores/${storeId}/customers`);
}

export async function updateCustomerAction(storeId: string, customerId: string, formData: FormData) {
  await updateCustomerFromForm(storeId, customerId, formData);
  revalidatePath(`/stores/${storeId}/customers`);
  redirect(`/stores/${storeId}/customers/${customerId}`);
}

export async function deleteCustomerAction(storeId: string, customerId: string) {
  await deleteCustomer(storeId, customerId);
  revalidatePath(`/stores/${storeId}/customers`);
  redirect(`/stores/${storeId}/customers`);
}

export async function createEstimateAction(storeId: string, formData: FormData) {
  await createDocumentFromForm(storeId, "estimates", formData);
  revalidatePath(`/stores/${storeId}/estimates`);
  redirect(`/stores/${storeId}/estimates`);
}

export async function updateEstimateAction(storeId: string, estimateId: string, formData: FormData) {
  await updateDocumentFromForm(storeId, estimateId, "estimates", formData);
  revalidatePath(`/stores/${storeId}/estimates`);
  redirect(`/stores/${storeId}/estimates/${estimateId}`);
}

export async function deleteEstimateAction(storeId: string, estimateId: string) {
  await deleteDocument(storeId, estimateId, "estimates");
  revalidatePath(`/stores/${storeId}/estimates`);
  redirect(`/stores/${storeId}/estimates`);
}

export async function createInvoiceAction(storeId: string, formData: FormData) {
  await createDocumentFromForm(storeId, "invoices", formData);
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/invoices`);
}

export async function updateInvoiceAction(storeId: string, invoiceId: string, formData: FormData) {
  await updateDocumentFromForm(storeId, invoiceId, "invoices", formData);
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/invoices/${invoiceId}`);
}

export async function deleteInvoiceAction(storeId: string, invoiceId: string) {
  await deleteDocument(storeId, invoiceId, "invoices");
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/invoices`);
}
