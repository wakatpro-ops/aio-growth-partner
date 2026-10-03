"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeUnifiedImport, reanalyzeUnifiedImport, saveUnifiedImportReview, uploadUnifiedImportFile } from "@/lib/unified-import/data";
import { applyUnifiedImportClarification, previewUnifiedImportClarification } from "@/lib/unified-import/clarification-data";

function errorParam(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return encodeURIComponent(message.includes("NEXT_") ? "この店舗のデータを操作する権限がないか、ログイン状態を確認できませんでした。" : message);
}

export async function uploadUnifiedImportAction(storeId: string, onboarding: boolean, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  let result: { jobId: string; duplicate: boolean } | null = null;
  try {
    result = await uploadUnifiedImportFile(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai?error=${errorParam(error)}${onboarding ? "&onboarding=1" : ""}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai`);
  const query = new URLSearchParams();
  if (result?.duplicate) query.set("duplicate", "1");
  if (onboarding) query.set("onboarding", "1");
  redirect(`/stores/${storeId}/data-imports/ai/${result?.jobId}${query.size ? `?${query}` : ""}`);
}

export async function saveUnifiedImportReviewAction(storeId: string, jobId: string, onboarding: boolean, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  let result: { unresolved: number; approved: number } | null = null;
  try {
    result = await saveUnifiedImportReview(storeId, jobId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai/${jobId}?error=${errorParam(error)}${onboarding ? "&onboarding=1" : ""}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai/${jobId}`);
  redirect(`/stores/${storeId}/data-imports/ai/${jobId}?${result?.unresolved ? `questions=${result.unresolved}` : "reviewed=1"}${onboarding ? "&onboarding=1" : ""}`);
}

export async function reanalyzeUnifiedImportAction(storeId: string, jobId: string, onboarding: boolean) {
  await requireStoreActionWriteAccess(storeId);
  let nextJobId: string;
  try {
    nextJobId = (await reanalyzeUnifiedImport(storeId, jobId)).jobId;
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai/${jobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai`);
  redirect(`/stores/${storeId}/data-imports/ai/${nextJobId}?reanalyzed=1${onboarding ? "&onboarding=1" : ""}`);
}

export async function executeUnifiedImportAction(storeId: string, jobId: string, onboarding: boolean, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await executeUnifiedImport(storeId, jobId, String(formData.get("expected_revision") ?? ""));
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai/${jobId}?error=${errorParam(error)}${onboarding ? "&onboarding=1" : ""}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai`);
  revalidatePath(`/stores/${storeId}/data-imports/ai/${jobId}`);
  revalidatePath(`/stores/${storeId}/sales`);
  revalidatePath(`/stores/${storeId}/sales-hub`);
  revalidatePath(`/stores/${storeId}/accounting/receipts`);
  revalidatePath(`/stores/${storeId}/customers`);
  revalidatePath(`/stores/${storeId}/items`);
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/data-imports/ai/${jobId}?completed=1${onboarding ? "&onboarding=1" : ""}`);
}

export async function previewImportClarificationAction(storeId: string, jobId: string, formData: FormData) {
  try {
    await requireStoreActionWriteAccess(storeId);
    return { preview: await previewUnifiedImportClarification(storeId, jobId, formData) };
  } catch (error) { return { error: decodeURIComponent(errorParam(error)) }; }
}

export async function applyImportClarificationAction(storeId: string, jobId: string, formData: FormData) {
  try {
    await requireStoreActionWriteAccess(storeId);
    await applyUnifiedImportClarification(storeId, jobId, formData);
    revalidatePath(`/stores/${storeId}/data-imports/ai/${jobId}`);
    return { success: true };
  } catch (error) { return { error: decodeURIComponent(errorParam(error)) }; }
}
