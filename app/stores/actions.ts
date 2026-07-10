"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createStoreFromForm } from "@/lib/stores";

function errorParam(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "保存に失敗しました。入力内容を確認してください。");
}

export async function createStoreAction(formData: FormData) {
  let storeId: string;
  try {
    storeId = await createStoreFromForm(formData);
  } catch (error) {
    redirect(`/stores/new?error=${errorParam(error)}`);
  }
  revalidatePath("/stores");
  revalidatePath("/dashboard");
  redirect(`/onboarding?storeId=${storeId}&created=1`);
}
