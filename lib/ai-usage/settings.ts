import { z } from "zod";

function optionalDecimal(max: number, decimals: number, allowZero: boolean) {
  return z.string().trim().transform(value => value === "" ? null : value).refine(value => value === null || /^\d+(?:\.\d+)?$/.test(value), "半角の数値を入力してください。")
    .refine(value => value === null || (value.split(".")[1]?.length ?? 0) <= decimals, `小数点以下${decimals}桁以内で入力してください。`)
    .transform(value => value === null ? null : Number(value))
    .refine(value => value === null || (Number.isFinite(value) && value <= max && (allowZero ? value >= 0 : value > 0)), "入力値が許容範囲外です。");
}
export const aiUsageMonthlySettingsSchema = z.object({
  month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "対象月を選択してください。"),
  usdJpy: optionalDecimal(10000, 6, false),
  serviceRevenueJpy: optionalDecimal(999999999999.99, 2, true)
});
export type AiUsageSettingsInput = z.infer<typeof aiUsageMonthlySettingsSchema>;
export type AiUsageSettingsResult = { ok: boolean; message: string };

/** Auth runs before validation and persistence, including direct server-action calls. */
export async function persistAiUsageMonthlySettings(formData: FormData, dependencies: {
  requirePlatformAdmin: () => Promise<{ userId: string }>;
  save: (settings: AiUsageSettingsInput, actorUserId: string) => Promise<void>;
}): Promise<AiUsageSettingsResult> {
  const access = await dependencies.requirePlatformAdmin();
  const parsed = aiUsageMonthlySettingsSchema.safeParse({ month: formData.get("month"), usdJpy: formData.get("usd_jpy"), serviceRevenueJpy: formData.get("service_revenue_jpy") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力内容を確認してください。" };
  try {
    await dependencies.save(parsed.data, access.userId);
    return { ok: true, message: "月別の換算レート・AIOb利用料売上を更新しました。以前の設定は監査履歴に保持されます。" };
  } catch {
    return { ok: false, message: "月別設定を更新できませんでした。接続・権限・DBの準備状態を確認してください。" };
  }
}
