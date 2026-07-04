"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateDemandActionPlan } from "@/lib/phase4/demand-actions";

function errorParam(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return encodeURIComponent(message);
}

export async function generateDemandActionPlanAction(storeId: string, returnTo: string, formData: FormData) {
  const targetMonth = String(formData.get("target_month") ?? "");
  try {
    await generateDemandActionPlan(storeId, targetMonth);
  } catch (error) {
    redirect(`${returnTo}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/sales/forecast`);
  revalidatePath(`/stores/${storeId}/inventory/alerts`);
  revalidatePath(`/stores/${storeId}/actions`);
  redirect(returnTo);
}
