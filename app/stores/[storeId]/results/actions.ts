"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addAiVisibilityQuestionFromForm,
  addSearchVisibilityKeywordFromForm,
  archiveAiVisibilityQuestion,
  archiveSearchVisibilityKeyword,
  recordManualSearchSnapshotFromForm,
  restoreAiVisibilityQuestion,
  restoreSearchVisibilityKeyword,
  runAiVisibilityObservation,
  saveSearchVisibilitySettingFromForm,
  syncSearchConsole,
  updateAiVisibilityQuestionFromForm,
  updateSearchVisibilityKeywordFromForm
} from "@/lib/results-visibility";

function errorParam(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

function resultsPath(storeId: string) {
  return `/stores/${storeId}/results`;
}

function revalidateResults(storeId: string) {
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(resultsPath(storeId));
  revalidatePath(`${resultsPath(storeId)}/deleted`);
}

export async function saveSearchVisibilitySettingAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await saveSearchVisibilitySettingFromForm(storeId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#measurement-settings`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?settingsSaved=1#measurement-settings`);
}

export async function addSearchVisibilityKeywordAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await addSearchVisibilityKeywordFromForm(storeId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keywords`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?keywordAdded=1#keywords`);
}

export async function updateSearchVisibilityKeywordAction(storeId: string, keywordId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await updateSearchVisibilityKeywordFromForm(storeId, keywordId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keyword-${keywordId}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?keywordUpdated=1#keyword-${keywordId}`);
}

export async function archiveSearchVisibilityKeywordAction(storeId: string, keywordId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await archiveSearchVisibilityKeyword(storeId, keywordId); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keywords`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?keywordDeleted=1#keywords`);
}

export async function restoreSearchVisibilityKeywordAction(storeId: string, keywordId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await restoreSearchVisibilityKeyword(storeId, keywordId); }
  catch (error) { redirect(`${resultsPath(storeId)}/deleted?error=${errorParam(error)}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}/deleted?restored=1`);
}

export async function recordManualSearchSnapshotAction(storeId: string, keywordId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await recordManualSearchSnapshotFromForm(storeId, keywordId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keyword-${keywordId}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?snapshotSaved=1#keyword-${keywordId}`);
}

export async function syncSearchConsoleAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await syncSearchConsole(storeId); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#search-console`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?synced=1#search-console`);
}

export async function addAiVisibilityQuestionAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await addAiVisibilityQuestionFromForm(storeId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#ai-visibility`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?aiQuestionAdded=1#ai-visibility`);
}

export async function updateAiVisibilityQuestionAction(storeId: string, questionId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await updateAiVisibilityQuestionFromForm(storeId, questionId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#ai-question-${questionId}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?aiQuestionUpdated=1#ai-question-${questionId}`);
}

export async function archiveAiVisibilityQuestionAction(storeId: string, questionId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await archiveAiVisibilityQuestion(storeId, questionId); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#ai-visibility`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?aiQuestionDeleted=1#ai-visibility`);
}

export async function restoreAiVisibilityQuestionAction(storeId: string, questionId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await restoreAiVisibilityQuestion(storeId, questionId); }
  catch (error) { redirect(`${resultsPath(storeId)}/deleted?error=${errorParam(error)}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}/deleted?aiRestored=1`);
}

export async function runAiVisibilityObservationAction(storeId: string, questionId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await runAiVisibilityObservation(storeId, questionId); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#ai-question-${questionId}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?aiObserved=1#ai-question-${questionId}`);
}
