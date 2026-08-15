"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addSearchVisibilityKeywordFromForm,
  archiveSearchVisibilityKeyword,
  recordManualSearchSnapshotFromForm,
  restoreSearchVisibilityKeyword,
  saveSearchVisibilitySettingFromForm,
  syncSearchConsole
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
  try { await saveSearchVisibilitySettingFromForm(storeId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#measurement-settings`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?settingsSaved=1#measurement-settings`);
}

export async function addSearchVisibilityKeywordAction(storeId: string, formData: FormData) {
  try { await addSearchVisibilityKeywordFromForm(storeId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keywords`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?keywordAdded=1#keywords`);
}

export async function archiveSearchVisibilityKeywordAction(storeId: string, keywordId: string) {
  try { await archiveSearchVisibilityKeyword(storeId, keywordId); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keywords`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?keywordDeleted=1#keywords`);
}

export async function restoreSearchVisibilityKeywordAction(storeId: string, keywordId: string) {
  try { await restoreSearchVisibilityKeyword(storeId, keywordId); }
  catch (error) { redirect(`${resultsPath(storeId)}/deleted?error=${errorParam(error)}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}/deleted?restored=1`);
}

export async function recordManualSearchSnapshotAction(storeId: string, keywordId: string, formData: FormData) {
  try { await recordManualSearchSnapshotFromForm(storeId, keywordId, formData); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#keyword-${keywordId}`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?snapshotSaved=1#keyword-${keywordId}`);
}

export async function syncSearchConsoleAction(storeId: string) {
  try { await syncSearchConsole(storeId); }
  catch (error) { redirect(`${resultsPath(storeId)}?error=${errorParam(error)}#search-console`); }
  revalidateResults(storeId);
  redirect(`${resultsPath(storeId)}?synced=1#search-console`);
}
