"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

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
  updateItemFromForm
} from "@/lib/phase2/business-data";
import { createInventoryMovementFromForm } from "@/lib/inventory-operations";

export async function createItemAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await createItemFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/items`);
  redirect(`/stores/${storeId}/items?saved=item`);
}

export async function updateItemAction(storeId: string, itemId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await updateItemFromForm(storeId, itemId, formData);
  revalidatePath(`/stores/${storeId}/items`);
  redirect(`/stores/${storeId}/items?saved=item-updated`);
}

export async function deleteItemAction(storeId: string, itemId: string) {
  await requireStoreActionWriteAccess(storeId);
  await deleteItem(storeId, itemId);
  revalidatePath(`/stores/${storeId}/items`);
  redirect(`/stores/${storeId}/items`);
}

export async function updateStockAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await createInventoryMovementFromForm(storeId, formData);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "在庫を更新できませんでした。");
    redirect(`/stores/${storeId}/inventory?error=${message}`);
  }
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/inventory?saved=movement`);
}

export async function createCustomerAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await createCustomerFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/customers`);
  redirect(`/stores/${storeId}/customers?saved=customer`);
}

export async function updateCustomerAction(storeId: string, customerId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await updateCustomerFromForm(storeId, customerId, formData);
  revalidatePath(`/stores/${storeId}/customers`);
  redirect(`/stores/${storeId}/customers?saved=customer-updated`);
}

export async function deleteCustomerAction(storeId: string, customerId: string) {
  await requireStoreActionWriteAccess(storeId);
  await deleteCustomer(storeId, customerId);
  revalidatePath(`/stores/${storeId}/customers`);
  redirect(`/stores/${storeId}/customers`);
}

export async function createEstimateAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await createDocumentFromForm(storeId, "estimates", formData);
  revalidatePath(`/stores/${storeId}/estimates`);
  redirect(`/stores/${storeId}/estimates?saved=estimate`);
}

export async function updateEstimateAction(storeId: string, estimateId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await updateDocumentFromForm(storeId, estimateId, "estimates", formData);
  revalidatePath(`/stores/${storeId}/estimates`);
  redirect(`/stores/${storeId}/estimates?saved=estimate-updated`);
}

export async function deleteEstimateAction(storeId: string, estimateId: string) {
  await requireStoreActionWriteAccess(storeId);
  await deleteDocument(storeId, estimateId, "estimates");
  revalidatePath(`/stores/${storeId}/estimates`);
  redirect(`/stores/${storeId}/estimates`);
}

export async function createInvoiceAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await createDocumentFromForm(storeId, "invoices", formData);
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/invoices?saved=invoice`);
}

export async function updateInvoiceAction(storeId: string, invoiceId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await updateDocumentFromForm(storeId, invoiceId, "invoices", formData);
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/invoices?saved=invoice-updated`);
}

export async function deleteInvoiceAction(storeId: string, invoiceId: string) {
  await requireStoreActionWriteAccess(storeId);
  await deleteDocument(storeId, invoiceId, "invoices");
  revalidatePath(`/stores/${storeId}/invoices`);
  redirect(`/stores/${storeId}/invoices`);
}
