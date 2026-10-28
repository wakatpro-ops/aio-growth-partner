"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectAirRegi, probeAirRegi, transitionAirRegi } from "@/lib/airregi/service";
import { AirRegiBridgeError } from "@/lib/airregi/bridge";
import { z } from "zod";

export async function connectAirRegiAction(storeId: string, form: FormData): Promise<{ externalStoreId?: string; connected?: boolean; error?: string }> {
  try {
    const credentials = z.object({ apiKey: z.string().trim().min(1).max(8192), apiToken: z.string().trim().min(1).max(8192) }).parse({ apiKey: form.get("apiKey"), apiToken: form.get("apiToken") });
    if (form.get("intent") === "probe") {
      return { externalStoreId: (await probeAirRegi(storeId, credentials)).externalStoreId };
    }
    if (form.get("intent") !== "connect" || form.get("consent") !== "yes" || form.get("noOverlap") !== "yes") return { error: "接続先と売上の重複がないことを確認し、読み取り連携に同意してから進めてください。" };
    const external = z.string().min(1).max(160).parse(form.get("confirmedExternalStoreId"));
    await connectAirRegi(storeId, credentials, external);
    revalidatePath(`/stores/${storeId}/settings/integrations/airregi`);
    return { connected: true };
  } catch (error) {
    if (error instanceof Error && error.message === "air_regi_existing_sales_review_required") return { error: "同じ期間にファイルから取り込んだ売上があります。二重計上を防ぐため接続を保留しました。AIOb運営へ切り替え期間をご相談ください。" };
    if (error instanceof AirRegiBridgeError) {
      const messages: Record<string, string> = {
        authentication_required: "AirレジのAPI利用設定と、キー・トークンを確認してください。",
        ip_not_registered: "接続環境の登録確認が必要です。AIOb運営へお問い合わせください。",
        rate_limited: "Airレジへの接続が混み合っています。少し待ってお試しください。",
        store_mismatch: "接続先の店舗が変わりました。店舗番号を確認し直してください。"
      };
      return { error: messages[error.code] ?? "接続を確認できませんでした。接続情報と利用権限を確認してください。" };
    }
    return { error: "接続を保存できませんでした。店舗オーナーの権限、接続情報、削除済みの接続を確認してください。" };
  }
}

export async function transitionAirRegiAction(storeId: string, id: string, action: string, revision: number) {
  const path = `/stores/${storeId}/settings/integrations/airregi`;
  try { await transitionAirRegi(storeId, id, action, revision); }
  catch { redirect(`${path}?error=1`); }
  revalidatePath(path);
  redirect(`${path}?done=${encodeURIComponent(action)}`);
}
