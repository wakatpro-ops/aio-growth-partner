import "server-only";
import { z } from "zod";
import { squareHost, SQUARE_VERSION, type SquareEnvironment } from "./policy";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u);
export const squareLocationSchema = z.object({ id, merchant_id: id, name: z.string().min(1).max(300), country: z.literal("JP"), currency: z.literal("JPY"), timezone: z.literal("Asia/Tokyo"), status: z.literal("ACTIVE") });
export type SquareLocation = z.infer<typeof squareLocationSchema>;
export type SquareTokens = { accessToken: string; refreshToken: string; expiresAt: string; merchantId: string };
const tokenSchema = z.object({ access_token: z.string().min(1).max(8192), refresh_token: z.string().min(1).max(8192), expires_at: z.string().datetime({ offset: true }), merchant_id: id });

export class SquareClient {
  constructor(readonly environment: SquareEnvironment, private readonly appId: string, private readonly appSecret: string, private readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, token?: string, body?: unknown) {
    // No caller-supplied URL, redirects, mutation endpoint, or provider error text.
    if (!/^\/(?:oauth2\/token|v2\/locations|v2\/orders\/search)$/u.test(path)) throw new Error("invalid_square_endpoint");
    let response: Response;
    try {
      response = await this.fetcher(squareHost(this.environment) + path, { method: body === undefined ? "GET" : "POST", headers: { "Square-Version": SQUARE_VERSION, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    } catch { throw new Error("square_unavailable"); }
    if (!response.ok) { await response.body?.cancel(); throw new Error(response.status === 401 || response.status === 403 ? "square_reconnect_required" : response.status === 429 ? "square_rate_limited" : "square_unavailable"); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("invalid_provider_data");
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("square_response_too_large"); } chunks.push(value); }
    let result;
    try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("invalid_provider_data"); }
    if (!result || typeof result !== "object" || Array.isArray(result) || result.errors) throw new Error("invalid_provider_data");
    return result as Record<string, unknown>;
  }
  private tokens(value: unknown): SquareTokens {
    const t = tokenSchema.parse(value);
    if (Date.parse(t.expires_at) <= Date.now() || Date.parse(t.expires_at) > Date.now() + 40 * 86400_000) throw new Error("invalid_provider_data");
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at, merchantId: t.merchant_id };
  }
  async exchange(code: string, redirect: string) {
    return this.tokens(await this.request("/oauth2/token", undefined, { client_id: this.appId, client_secret: this.appSecret, grant_type: "authorization_code", code, redirect_uri: redirect }));
  }
  async refresh(tokens: SquareTokens) {
    const refreshed = this.tokens(await this.request("/oauth2/token", undefined, { client_id: this.appId, client_secret: this.appSecret, grant_type: "refresh_token", refresh_token: tokens.refreshToken }));
    if (refreshed.merchantId !== tokens.merchantId) throw new Error("store_mismatch");
    return refreshed;
  }
  async locations(tokens: SquareTokens): Promise<SquareLocation[]> {
    const result = await this.request("/v2/locations", tokens.accessToken);
    if (!Array.isArray(result.locations) || result.locations.length > 1000) throw new Error("invalid_provider_data");
    const locations = result.locations.map(value => squareLocationSchema.safeParse(value)).filter(result => result.success).map(result => result.data!);
    if (locations.some(location => location.merchant_id !== tokens.merchantId)) throw new Error("store_mismatch");
    return locations;
  }
  async orders(tokens: SquareTokens, locationId: string, start: string, end: string, cursor?: string) {
    id.parse(locationId);
    if (![start, end].every(x => Number.isFinite(Date.parse(x))) || Date.parse(start) >= Date.parse(end)) throw new Error("invalid_window");
    const result = await this.request("/v2/orders/search", tokens.accessToken, { location_ids: [locationId], limit: 100, return_entries: false, ...(cursor ? { cursor } : {}), query: { filter: { date_time_filter: { updated_at: { start_at: start, end_at: end } } }, sort: { sort_field: "UPDATED_AT", sort_order: "ASC" } } });
    if (result.orders !== undefined && (!Array.isArray(result.orders) || result.orders.length > 100)) throw new Error("invalid_provider_data");
    if (result.cursor !== undefined && (typeof result.cursor !== "string" || !result.cursor.length || result.cursor.length > 1500)) throw new Error("invalid_provider_data");
    return { orders: (result.orders ?? []) as unknown[], cursor: result.cursor as string | undefined };
  }
}
