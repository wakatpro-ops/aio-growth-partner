import "server-only";
import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createUsageFetch, type AiMeterContext, type MeterEvent } from "./transport";
export type { AiMeterContext } from "./transport";

async function saveUsage(event: MeterEvent) {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("usage_store_unavailable");
  // Observability must not turn a successful model response into an AI failure
  // or add provider retries. Bound recording latency; log only the event ID on failure.
  const { error } = await client.from("ai_usage_events").insert(event).abortSignal(AbortSignal.timeout(1200));
  if (error) throw new Error("usage_record_failed");
}

export function createMeteredFetch(context: AiMeterContext): typeof fetch {
  return createUsageFetch(context, saveUsage);
}

export function createMeteredOpenAI(context: AiMeterContext, options: ConstructorParameters<typeof OpenAI>[0] = {}) {
  return new OpenAI({ ...options, apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY,
    fetch: createUsageFetch(context, saveUsage, options?.fetch as typeof fetch | undefined) as NonNullable<ConstructorParameters<typeof OpenAI>[0]>["fetch"] });
}
