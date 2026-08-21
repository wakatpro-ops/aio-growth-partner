"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  approveGoogleReviewReply,
  disconnectGoogle,
  executeGoogleIntegration,
  publishGoogleBusinessPost,
  publishGoogleReviewReply,
  prepareGooglePublishJob,
  saveGoogleReviewReplyDraft,
  syncGoogleBusinessReviews,
  syncGoogleBusinessProfileCandidates,
  upsertGoogleBusinessProfile,
  upsertGoogleCalendar,
  upsertGoogleGmail
} from "@/lib/phase5/google-integrations";
import {
  generateGrowthActions,
  markGoogleBusinessProfileManualPost,
  markSnsManualPost,
  submitGrowthActionApproval,
  updateGrowthActionDraft,
  updateGrowthActionStatus,
  upsertExternalChannelAccount
} from "@/lib/phase5/growth-actions";
import type { GrowthActionStatus } from "@/types/phase5";
import { approveSnsMedia, archiveSnsMedia, disconnectMeta, executeSnsPublishJob, queueSnsPublish, selectMetaPage, uploadSnsMedia } from "@/lib/phase5/sns-publishing";

function errorRedirect(path: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function generateGrowthActionsAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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

export async function markSnsManualPostAction(storeId: string, actionId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/sns-post`;
  try {
    await markSnsManualPost(storeId, actionId, formData);
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/growth-calendar`);
    revalidatePath(`/stores/${storeId}/settings/channels`);
    revalidatePath(`/stores/${storeId}/growth-actions/${actionId}`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?saved=1`);
}

export async function uploadSnsMediaAction(storeId: string, actionId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/sns-post`;
  let duplicate = false;
  try {
    const result = await uploadSnsMedia(storeId, actionId, formData);
    duplicate = result.duplicate;
    revalidatePath(path);
  } catch (error) { errorRedirect(path, error); }
  redirect(`${path}?${duplicate ? "duplicate" : "uploaded"}=1#sns-media`);
}

export async function approveSnsMediaAction(storeId: string, actionId: string, jobId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/sns-post`;
  try { await approveSnsMedia(storeId, actionId, jobId, formData); revalidatePath(path); }
  catch (error) { errorRedirect(path, error); }
  redirect(`${path}?approved=1#sns-media`);
}

export async function archiveSnsMediaAction(storeId: string, actionId: string, jobId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/sns-post`;
  try { await archiveSnsMedia(storeId, actionId, jobId); revalidatePath(path); }
  catch (error) { errorRedirect(path, error); }
  redirect(`${path}?deleted=1#sns-media`);
}

export async function queueSnsPublishAction(storeId: string, actionId: string, jobId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/sns-post`;
  try {
    const queued = await queueSnsPublish(storeId, actionId, jobId, formData);
    if (queued.status === "ready") await executeSnsPublishJob(queued.jobId);
    revalidatePath(path);
  } catch (error) { errorRedirect(path, error); }
  redirect(`${path}?queued=1#publish-history`);
}

export async function retrySnsPublishAction(storeId: string, actionId: string, jobId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/sns-post`;
  try { await executeSnsPublishJob(jobId); revalidatePath(path); }
  catch (error) { errorRedirect(path, error); }
  redirect(`${path}?retried=1#publish-history`);
}

export async function selectMetaPageAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/settings/channels`;
  try { await selectMetaPage(storeId, String(formData.get("page_id") ?? "")); revalidatePath(path); }
  catch (error) { errorRedirect(path, error); }
  redirect(`${path}?meta_selected=1`);
}

export async function disconnectMetaAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/settings/channels`;
  try { await disconnectMeta(storeId); revalidatePath(path); }
  catch (error) { errorRedirect(path, error); }
  redirect(`${path}?meta_disconnected=1`);
}

export async function upsertExternalChannelAccountAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/settings/google`;
  try {
    await disconnectGoogle(storeId);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?disconnected=1`);
}

export async function upsertGoogleBusinessProfileAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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
  await requireStoreActionWriteAccess(storeId);
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

export async function publishGoogleBusinessPostAction(storeId: string, actionId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/growth-actions/${actionId}/send`;
  let jobId: string | null = null;
  try {
    const result = await publishGoogleBusinessPost(storeId, actionId);
    jobId = result.jobId;
    revalidatePath(`/stores/${storeId}/growth-actions`);
    revalidatePath(`/stores/${storeId}/settings/google`);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?executed=google_business_profile${jobId ? `&job=${jobId}` : ""}`);
}

export async function syncGoogleBusinessReviewsAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/reviews`;
  let count = 0;
  try {
    const result = await syncGoogleBusinessReviews(storeId);
    count = result.count;
    revalidatePath(path);
    revalidatePath(`/stores/${storeId}/settings/google`);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?synced=1&count=${count}`);
}

export async function saveGoogleReviewReplyDraftAction(storeId: string, reviewId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/reviews`;
  try {
    await saveGoogleReviewReplyDraft(storeId, reviewId, formData);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?saved=1`);
}

export async function approveGoogleReviewReplyAction(storeId: string, reviewId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/reviews`;
  try {
    await approveGoogleReviewReply(storeId, reviewId);
    revalidatePath(path);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?approved=1`);
}

export async function publishGoogleReviewReplyAction(storeId: string, reviewId: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/reviews`;
  try {
    await publishGoogleReviewReply(storeId, reviewId);
    revalidatePath(path);
    revalidatePath(`/stores/${storeId}/settings/google`);
  } catch (error) {
    errorRedirect(path, error);
  }
  redirect(`${path}?published=1`);
}
