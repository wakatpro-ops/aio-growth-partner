"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  generateGrowthActions,
  submitGrowthActionApproval,
  updateGrowthActionDraft,
  updateGrowthActionStatus,
  upsertExternalChannelAccount
} from "@/lib/phase5/growth-actions";
import type { GrowthActionStatus } from "@/types/phase5";

function errorRedirect(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function generateGrowthActionsAction(storeId: string) {
  const path = `/stores/${storeId}/growth-actions`;
  try {
    await generateGrowthActions(storeId);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function updateGrowthActionStatusAction(storeId: string, actionId: string, formData: FormData) {
  const path = `/stores/${storeId}/growth-actions/${actionId}`;
  const status = String(formData.get("status") ?? "todo") as GrowthActionStatus;
  try {
    await updateGrowthActionStatus(storeId, actionId, status);
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function updateGrowthActionDraftAction(storeId: string, actionId: string, formData: FormData) {
  const path = `/stores/${storeId}/growth-actions/${actionId}/edit`;
  try {
    await updateGrowthActionDraft(storeId, actionId, formData);
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/growth-calendar`);
    revalidatePath(`/stores/${storeId}/growth-actions/${actionId}`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`/stores/${storeId}/growth-actions/${actionId}`);
}

export async function submitGrowthActionApprovalAction(storeId: string, actionId: string, formData: FormData) {
  const path = `/stores/${storeId}/growth-actions/${actionId}`;
  try {
    await submitGrowthActionApproval(storeId, actionId, formData);
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/growth-calendar`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function upsertExternalChannelAccountAction(storeId: string, formData: FormData) {
  const path = `/stores/${storeId}/settings/channels`;
  try {
    await upsertExternalChannelAccount(storeId, formData);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}
