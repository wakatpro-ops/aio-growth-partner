"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  runAioRediagnosis,
  saveAioGoalFromForm,
  startAioImprovementTask,
  updateAioImprovementTaskFromForm
} from "@/lib/aio-improvement";

function errorParam(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

function revalidateAio(storeId: string) {
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/stores/${storeId}/aio-improvement`);
  revalidatePath(`/stores/${storeId}/aio-improvement/history`);
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
}

export async function saveAioGoalAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await saveAioGoalFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/aio-improvement?error=${errorParam(error)}#questions`);
  }
  revalidateAio(storeId);
  redirect(`/stores/${storeId}/aio-improvement?goalSaved=1#questions`);
}

export async function startAioImprovementTaskAction(storeId: string, sourceKey: string) {
  await requireStoreActionWriteAccess(storeId);
  let taskId: string | null = null;
  try {
    taskId = await startAioImprovementTask(storeId, sourceKey);
  } catch (error) {
    redirect(`/stores/${storeId}/aio-improvement?error=${errorParam(error)}#priority`);
  }
  revalidateAio(storeId);
  redirect(`/stores/${storeId}/aio-improvement/tasks/${taskId}?started=1`);
}

export async function updateAioImprovementTaskAction(storeId: string, taskId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await updateAioImprovementTaskFromForm(storeId, taskId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/aio-improvement/tasks/${taskId}?error=${errorParam(error)}`);
  }
  revalidateAio(storeId);
  revalidatePath(`/stores/${storeId}/aio-improvement/tasks/${taskId}`);
  redirect(`/stores/${storeId}/aio-improvement/tasks/${taskId}?saved=1`);
}

export async function runAioRediagnosisAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await runAioRediagnosis(storeId);
  } catch (error) {
    redirect(`/stores/${storeId}/aio-improvement?error=${errorParam(error)}#rediagnosis`);
  }
  revalidateAio(storeId);
  redirect(`/stores/${storeId}/aio-improvement?rediagnosed=1#rediagnosis`);
}
