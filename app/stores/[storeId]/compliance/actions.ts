"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOrderFromForm, createPaymentFromForm, updateInvoiceSettingsFromForm } from "@/lib/phase6/compliance-data";

export async function createOrderAction(storeId: string, formData: FormData) {
  await createOrderFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}/orders`);
  redirect(`/stores/${storeId}/orders`);
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
