"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmInitialSetup, saveInitialSetupDraft } from "@/lib/onboarding/initial-setup";

export type InitialSetupActionState = { ok: false; message: string };

export async function saveInitialSetupDraftAction(storeId: string, formData: FormData) {
  await saveInitialSetupDraft(storeId, formData);
  revalidatePath(`/onboarding/setup-review`);
  redirect(`/onboarding?storeId=${storeId}&setupDraft=saved`);
}

export async function confirmInitialSetupAction(
  storeId: string,
  _previousState: InitialSetupActionState,
  formData: FormData
): Promise<InitialSetupActionState> {
  try {
    await confirmInitialSetup(storeId, formData);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "初期設定を反映できませんでした。もう一度お試しください。"
    };
  }
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath(`/onboarding/setup-review`);
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/stores/${storeId}/items`);
  revalidatePath(`/stores/${storeId}/settings`);
  redirect(`/stores/${storeId}/aio-improvement?setup=completed`);
}
