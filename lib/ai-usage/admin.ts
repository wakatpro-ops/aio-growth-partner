import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildAiUsageDashboard, emptyAiUsageAggregate, emptyAiUsageMetrics, normalizeUsageMonth, type AiUsageAggregate, type AiUsageDashboard, type AiUsageMetrics } from "@/lib/ai-usage/dashboard";
import { persistAiUsageMonthlySettings, type AiUsageSettingsResult } from "@/lib/ai-usage/settings";

const numeric = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metricsSchema = z.object(Object.fromEntries(Object.keys(emptyAiUsageMetrics()).map(key => [key, numeric])) as Record<keyof AiUsageMetrics, typeof numeric>);
const groupSchema = metricsSchema.extend({ key: z.string(), label: z.string() });
const aggregateSchema = z.object({
  totals: metricsSchema,
  stores: z.array(groupSchema),
  features: z.array(groupSchema),
  days: z.array(groupSchema),
  recent: z.object({ current: metricsSchema, previous: metricsSchema, groups: z.array(z.object({ key: z.string(), label: z.string(), scope: z.enum(["store", "feature"]), current: metricsSchema, previous: metricsSchema })) })
});

export async function getAiUsageDashboard(requestedMonth?: string): Promise<AiUsageDashboard> {
  await requirePlatformAdmin();
  const now = new Date();
  const month = normalizeUsageMonth(requestedMonth, now);
  const unavailable = (reason: string) => buildAiUsageDashboard({ month, now, aggregate: emptyAiUsageAggregate(), meteringStartedAt: null, unavailableReason: reason });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable("AI利用データへの接続が未設定です。利用ゼロを意味しません。");
  try {
    const [aggregate, settings, metering] = await Promise.all([
      supabase.rpc("ai_usage_dashboard_summary", { p_month: `${month}-01`, p_now: now.toISOString() }),
      supabase.from("ai_usage_monthly_settings").select("usd_jpy,service_revenue_jpy,updated_at").eq("month", `${month}-01`).maybeSingle(),
      supabase.from("ai_usage_settings").select("metering_started_at").eq("id", "default").maybeSingle()
    ]);
    if (aggregate.error || settings.error || metering.error) return unavailable("AI利用データを取得できません。DBの準備・接続を確認してください。利用ゼロとしては扱いません。");
    const parsed = aggregateSchema.safeParse(aggregate.data);
    const parsedSettings = z.object({ usd_jpy: z.coerce.number().finite().positive().max(10000).nullable(), service_revenue_jpy: z.coerce.number().finite().nonnegative().nullable(), updated_at: z.string().datetime({ offset: true }) }).safeParse(settings.data);
    const startedAt = metering.data?.metering_started_at;
    if (!parsed.success || (settings.data && !parsedSettings.success) || (startedAt !== null && startedAt !== undefined && !Number.isFinite(Date.parse(String(startedAt))))) return unavailable("AI利用データの形式を確認できません。集計値は表示していません。");
    return buildAiUsageDashboard({ month, now, aggregate: parsed.data as AiUsageAggregate, meteringStartedAt: startedAt ? String(startedAt) : null,
      settings: parsedSettings.success ? { usdJpy: parsedSettings.data.usd_jpy, serviceRevenueJpy: parsedSettings.data.service_revenue_jpy, updatedAt: parsedSettings.data.updated_at } : undefined });
  } catch {
    return unavailable("AI利用データの取得中に接続エラーが発生しました。集計値は表示していません。");
  }
}

export async function saveAiUsageMonthlySettingsAction(formData: FormData): Promise<AiUsageSettingsResult> {
  "use server";
  const result = await persistAiUsageMonthlySettings(formData, {
    requirePlatformAdmin,
    save: async (settings, actorUserId) => {
      const supabase = createSupabaseAdminClient();
      if (!supabase) throw new Error("AI_USAGE_UNAVAILABLE");
      const { error } = await supabase.rpc("save_ai_usage_monthly_settings", { p_month: `${settings.month}-01`, p_usd_jpy: settings.usdJpy, p_service_revenue_jpy: settings.serviceRevenueJpy, p_actor_user_id: actorUserId });
      if (error) throw new Error("AI_USAGE_SETTINGS_NOT_SAVED");
    }
  });
  if (result.ok) revalidatePath("/admin/ai-logs");
  return result;
}
