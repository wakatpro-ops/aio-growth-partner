"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSalesAiReport } from "@/lib/phase4/sales-ai-report";

function errorParam(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return encodeURIComponent(message);
}

export async function generateSalesAiReportAction(storeId: string, formData: FormData) {
  let reportId: string | null = null;
  const month = String(formData.get("target_month") ?? "");
  try {
    reportId = await createSalesAiReport(storeId, month);
  } catch (error) {
    redirect(`/stores/${storeId}/sales/reports/monthly-ai?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/sales/reports/monthly-ai`);
  redirect(reportId ? `/stores/${storeId}/sales/reports/monthly-ai/${reportId}` : `/stores/${storeId}/sales/reports/monthly-ai`);
}
