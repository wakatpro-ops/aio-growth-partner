"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createDraftFromRecommendation,
  createMarketingDraftFromForm,
  generateMarketingDraft,
  generateMonthlyRecommendation,
  updateMarketingDraftFromForm
} from "@/lib/phase3/marketing-data";
import type { MarketingChannel } from "@/types/phase3";

function errorParam(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return encodeURIComponent(message);
}

export async function createMarketingDraftAction(storeId: string, formData: FormData) {
  try {
    await createMarketingDraftFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/drafts/new?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/marketing/drafts`);
  redirect(`/stores/${storeId}/marketing/drafts`);
}

export async function updateMarketingDraftAction(storeId: string, draftId: string, formData: FormData) {
  try {
    await updateMarketingDraftFromForm(storeId, draftId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/drafts/${draftId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/marketing/drafts`);
  redirect(`/stores/${storeId}/marketing/drafts/${draftId}`);
}

export async function generateMarketingDraftAction(storeId: string, formData: FormData) {
  let draftId: string | null = null;
  try {
    draftId = await generateMarketingDraft(
      storeId,
      String(formData.get("channel") ?? "instagram") as MarketingChannel,
      String(formData.get("post_type") ?? "latest_info")
    );
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/drafts/new?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/marketing/drafts`);
  redirect(draftId ? `/stores/${storeId}/marketing/drafts/${draftId}` : `/stores/${storeId}/marketing/drafts`);
}

export async function generateMonthlyRecommendationAction(storeId: string, formData: FormData) {
  let recommendationId: string | null = null;
  try {
    recommendationId = await generateMonthlyRecommendation(storeId, String(formData.get("month") ?? ""));
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/recommendations?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/marketing/recommendations`);
  redirect(recommendationId ? `/stores/${storeId}/marketing/recommendations/${recommendationId}` : `/stores/${storeId}/marketing/recommendations`);
}

export async function createDraftFromRecommendationAction(storeId: string, recommendationId: string) {
  let draftId: string | null = null;
  try {
    draftId = await createDraftFromRecommendation(storeId, recommendationId);
  } catch (error) {
    redirect(`/stores/${storeId}/marketing/recommendations/${recommendationId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/marketing/drafts`);
  redirect(draftId ? `/stores/${storeId}/marketing/drafts/${draftId}` : `/stores/${storeId}/marketing/drafts`);
}
