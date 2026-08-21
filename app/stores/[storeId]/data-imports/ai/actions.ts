"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executeUnifiedImport, saveUnifiedImportReview, uploadUnifiedImportFile } from "@/lib/unified-import/data";

function errorParam(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return encodeURIComponent(message.includes("NEXT_") ? "この店舗のデータを操作する権限がないか、ログイン状態を確認できませんでした。" : message);
}

export async function uploadUnifiedImportAction(storeId: string, formData: FormData) {
  let result: { jobId: string; duplicate: boolean } | null = null;
  try {
    result = await uploadUnifiedImportFile(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai`);
  redirect(`/stores/${storeId}/data-imports/ai/${result?.jobId}${result?.duplicate ? "?duplicate=1" : ""}`);
}

export async function saveUnifiedImportReviewAction(storeId: string, jobId: string, formData: FormData) {
  let result: { unresolved: number; approved: number } | null = null;
  try {
    result = await saveUnifiedImportReview(storeId, jobId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai/${jobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai/${jobId}`);
  redirect(`/stores/${storeId}/data-imports/ai/${jobId}?${result?.unresolved ? `questions=${result.unresolved}` : "reviewed=1"}`);
}

export async function executeUnifiedImportAction(storeId: string, jobId: string) {
  try {
    await executeUnifiedImport(storeId, jobId);
  } catch (error) {
    redirect(`/stores/${storeId}/data-imports/ai/${jobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/data-imports/ai`);
  revalidatePath(`/stores/${storeId}/data-imports/ai/${jobId}`);
  revalidatePath(`/stores/${storeId}/sales`);
  revalidatePath(`/stores/${storeId}/accounting/receipts`);
  revalidatePath(`/stores/${storeId}/customers`);
  revalidatePath(`/stores/${storeId}/items`);
  revalidatePath(`/stores/${storeId}/inventory`);
  redirect(`/stores/${storeId}/data-imports/ai/${jobId}?completed=1`);
}
