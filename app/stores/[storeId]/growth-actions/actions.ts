"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  disconnectGoogle,
  executeGoogleIntegration,
  prepareGooglePublishJob,
  syncGoogleBusinessProfileCandidates,
  upsertGoogleBusinessProfile,
  upsertGoogleCalendar,
  upsertGoogleGmail
} from "@/lib/phase5/google-integrations";
import {
  generateGrowthActions,
  markGoogleBusinessProfileManualPost,
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

export async function markGoogleBusinessProfileManualPostAction(storeId: string, actionId: string, formData: FormData) {
  const path = `/stores/${storeId}/growth-actions/${actionId}/manual-post`;
  try {
    await markGoogleBusinessProfileManualPost(storeId, actionId, formData);
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/growth-calendar`);
    revalidatePath(`/stores/${storeId}/settings/google`);
    revalidatePath(`/stores/${storeId}/growth-actions/${actionId}`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?posted=1`);
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

export async function disconnectGoogleAction(storeId: string) {
  const path = `/stores/${storeId}/settings/google`;
  try {
    await disconnectGoogle(storeId);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function upsertGoogleBusinessProfileAction(storeId: string, formData: FormData) {
  const path = `/stores/${storeId}/settings/google/business-profile`;
  try {
    await upsertGoogleBusinessProfile(storeId, formData);
    revalidatePath(path);
    revalidatePath(`/stores/${storeId}/settings/google`);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function syncGoogleBusinessProfileCandidatesAction(storeId: string) {
  const path = `/stores/${storeId}/settings/google/business-profile`;
  let accountsCount = 0;
  let locationsCount = 0;
  try {
    const result = await syncGoogleBusinessProfileCandidates(storeId);
    accountsCount = result.accountsCount;
    locationsCount = result.locationsCount;
    revalidatePath(path);
    revalidatePath(`/stores/${storeId}/settings/google`);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?synced=1&accounts=${accountsCount}&locations=${locationsCount}`);
}

export async function upsertGoogleGmailAction(storeId: string, formData: FormData) {
  const path = `/stores/${storeId}/settings/google/gmail`;
  try {
    await upsertGoogleGmail(storeId, formData);
    revalidatePath(path);
    revalidatePath(`/stores/${storeId}/settings/google`);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function upsertGoogleCalendarAction(storeId: string, formData: FormData) {
  const path = `/stores/${storeId}/settings/google/calendar`;
  try {
    await upsertGoogleCalendar(storeId, formData);
    revalidatePath(path);
    revalidatePath(`/stores/${storeId}/settings/google`);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(path);
}

export async function prepareGooglePublishJobAction(storeId: string, actionId: string, formData: FormData) {
  const path = `/stores/${storeId}/growth-actions/${actionId}/send`;
  try {
    await prepareGooglePublishJob(storeId, actionId, formData);
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/settings/google`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?prepared=1`);
}

export async function executeGoogleIntegrationAction(storeId: string, actionId: string, target: "gmail" | "google_calendar", formData: FormData) {
  const path = `/stores/${storeId}/growth-actions/${actionId}/send`;
  let jobId: string | null = null;
  try {
    const result = await executeGoogleIntegration(storeId, actionId, target, formData);
    jobId = result.jobId;
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/settings/google`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?executed=${target}${jobId ? `&job=${jobId}` : ""}`);
}
