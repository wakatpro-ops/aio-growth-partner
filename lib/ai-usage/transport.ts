import { randomUUID } from "node:crypto";
import { priceUsage, type RequestPricingContext } from "./pricing.ts";

export type AiMeterContext = { feature: string; storeId?: string | null; organizationId?: string | null; userId?: string | null };
export type MeterEvent = ReturnType<typeof priceUsage> & {
  id: string; operation_id: string; attempt: number; feature: string;
  organization_id: string | null; store_id: string | null; user_id: string | null;
  provider: string; endpoint: string; status: "success" | "error"; http_status: number | null;
  request_id: string | null; duration_ms: number; created_at: string;
};
type Recorder = (event: MeterEvent) => Promise<void>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

/** One instance per business operation, reused by SDK and application retries. */
export function createUsageFetch(context: AiMeterContext, save: Recorder, baseFetch: typeof fetch = fetch): typeof fetch {
  const operationId = randomUUID();
  let attempts = 0;
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    // Never inspect OAuth, uploads or other third-party requests.
    if (url.origin !== "https://api.openai.com" || !["/v1/chat/completions", "/v1/responses"].includes(url.pathname)) return baseFetch(input, init);
    let metadata: RequestPricingContext = { model: "unknown", endpoint: url.pathname };
    try {
      // SDK and existing direct callers provide a JSON string. No request body is
      // retained or logged; attribution is supplied by trusted server callers.
      const request = record(typeof init?.body === "string" ? JSON.parse(init.body) : null);
      metadata = { ...metadata, model: typeof request.model === "string" ? request.model.slice(0, 100) : "unknown",
        serviceTier: typeof request.service_tier === "string" ? request.service_tier : null,
        tools: Array.isArray(request.tools) ? request.tools.map(tool => record(tool).type).filter((type): type is string => typeof type === "string") : [] };
    } catch { /* Usage may still carry the resolved model; malformed requests retain unknowns. */ }
    const started = Date.now(), attempt = ++attempts, id = randomUUID();
    const common = { id, operation_id: operationId, attempt, feature: context.feature,
      organization_id: context.organizationId ?? null, store_id: context.storeId ?? null, user_id: context.userId ?? null,
      provider: "openai", endpoint: url.pathname, created_at: new Date(started).toISOString() };
    const safeSave = async (event: MeterEvent) => {
      try { await save(event); }
      catch { console.warn("ai_usage_record_failed", { feature: context.feature, eventId: id }); }
    };
    let response: Response;
    try { response = await baseFetch(input, init); }
    catch (error) {
      await safeSave({ ...common, ...priceUsage(null, metadata), status: "error", http_status: null, request_id: null, duration_ms: Date.now() - started });
      throw error; // Preserve SDK's exact retry/error behavior.
    }
    let payload: unknown = null;
    try {
      if (response.headers.get("content-type")?.includes("application/json")) payload = await response.clone().json();
    } catch { /* Interrupted or non-JSON usage remains explicitly unmeasured. */ }
    const result = priceUsage(payload, metadata);
    await safeSave({ ...common, ...result, status: response.ok ? "success" : "error", http_status: response.status,
      request_id: response.headers.get("x-request-id")?.slice(0, 200) ?? null, duration_ms: Date.now() - started });
    return response; // Original body stays untouched for the caller and SDK retries.
  };
}
