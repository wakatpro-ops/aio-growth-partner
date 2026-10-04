"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  runAioRediagnosis,
  saveAioDraft,
  saveAioGoalFromForm,
  startAioImprovementTask,
  updateAioImprovementTaskFromForm
} from "@/lib/aio-improvement";

function errorParam(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

export async function saveAioDraftAction(storeId: string, taskId: string, _previous: { error?: string; saved?: boolean }, formData: FormData) {
  try {
    await requireStoreActionWriteAccess(storeId);
    await saveAioDraft(storeId, taskId, String(formData.get("draft_body") ?? ""));
    revalidateAio(storeId);
    revalidatePath(`/stores/${storeId}/marketing/aio-improvement/tasks/${taskId}`);
    return { saved: true };
  } catch (error) { return { error: error instanceof Error ? error.message : "保存できませんでした。入力は残っています。" }; }
}

function revalidateAio(storeId: string) {
  revalidatePath(`/stores/${storeId}/marketing`);
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/stores/${storeId}/marketing/aio-improvement`);
  revalidatePath(`/stores/${storeId}/marketing/aio-improvement/history`);
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
}

export async function saveAioGoalAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await saveAioGoalFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/aio-improvement?error=${errorParam(error)}#questions`);
  }
  revalidateAio(storeId);
  redirect(`/stores/${storeId}/marketing/aio-improvement?goalSaved=1#questions`);
}

export async function startAioImprovementTaskAction(storeId: string, sourceKey: string) {
  await requireStoreActionWriteAccess(storeId);
  let taskId: string | null = null;
  try {
    taskId = await startAioImprovementTask(storeId, sourceKey);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/aio-improvement?error=${errorParam(error)}#priority`);
  }
  revalidateAio(storeId);
  redirect(`/stores/${storeId}/marketing/aio-improvement/tasks/${taskId}?started=1`);
}

export async function updateAioImprovementTaskAction(storeId: string, taskId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await updateAioImprovementTaskFromForm(storeId, taskId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/aio-improvement/tasks/${taskId}?error=${errorParam(error)}`);
  }
  revalidateAio(storeId);
  revalidatePath(`/stores/${storeId}/marketing/aio-improvement/tasks/${taskId}`);
  redirect(`/stores/${storeId}/marketing/aio-improvement/tasks/${taskId}?saved=1`);
}

export async function runAioRediagnosisAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await runAioRediagnosis(storeId);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/aio-improvement?error=${errorParam(error)}#rediagnosis`);
  }
  revalidateAio(storeId);
  redirect(`/stores/${storeId}/marketing/aio-improvement?rediagnosed=1#rediagnosis`);
}
