"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeImportJob, saveImportItemMatchesFromForm, saveMappingsFromForm, uploadGoogleSheetFromForm, uploadImportFileFromForm } from "@/lib/phase4/sales-import-data";

function errorParam(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return encodeURIComponent(message);
}

export async function uploadImportFileAction(storeId: string, formData: FormData) {
  let jobId: string | null = null;
  try {
    jobId = await uploadImportFileFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/new?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports`);
  redirect(jobId ? `/stores/${storeId}/data-imports/${jobId}` : `/stores/${storeId}/data-imports`);
}

export async function uploadGoogleSheetAction(storeId: string, formData: FormData) {
  let jobId: string | null = null;
  try {
    jobId = await uploadGoogleSheetFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/new?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports`);
  redirect(jobId ? `/stores/${storeId}/data-imports/${jobId}` : `/stores/${storeId}/data-imports`);
}

export async function saveImportMappingsAction(storeId: string, importJobId: string, formData: FormData) {
  try {
    await saveMappingsFromForm(storeId, importJobId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/${importJobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/${importJobId}`);
  redirect(`/stores/${storeId}/data-imports/${importJobId}`);
}

export async function executeImportJobAction(storeId: string, importJobId: string) {
  try {
    await executeImportJob(storeId, importJobId);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/${importJobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports`);
  revalidatePath(`/stores/${storeId}/sales`);
  revalidatePath(`/stores/${storeId}/sales/reports`);
  redirect(`/stores/${storeId}/data-imports/${importJobId}`);
}

export async function saveImportItemMatchesAction(storeId: string, importJobId: string, formData: FormData) {
  try {
    await saveImportItemMatchesFromForm(storeId, importJobId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/${importJobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/${importJobId}`);
  redirect(`/stores/${storeId}/data-imports/${importJobId}?matchesSaved=1`);
}

export async function retryImportErrorsAction(storeId: string, importJobId: string) {
  try {
    await executeImportJob(storeId, importJobId, { retryErrorsOnly: true });
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/${importJobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/${importJobId}`);
  revalidatePath(`/stores/${storeId}/sales`);
  redirect(`/stores/${storeId}/data-imports/${importJobId}?retried=1`);
}
