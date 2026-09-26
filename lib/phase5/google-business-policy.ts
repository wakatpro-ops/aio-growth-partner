/** Project approval is independent of a store's OAuth and location selection. */
export function googleBusinessApiApproved(
  profile?: { status?: string; metadata?: Record<string, unknown> } | null,
  configuredStatus = process.env.GOOGLE_BUSINESS_PROFILE_API_STATUS
) {
  // An explicit deployment setting wins over historical store metadata.
  if (configuredStatus) return configuredStatus === "approved";
  return profile?.status === "approved" || profile?.metadata?.api_status === "approved" ||
    profile?.metadata?.api_application_result === "approved";
}

/** Never return a partial snapshot: callers may reconcile missing cached rows. */
export async function fetchGoogleBusinessPages(
  endpoint: string,
  collection: string,
  accessToken: string,
  maxPages: number,
  describeError: (result: Record<string, unknown>) => string,
  request: typeof fetch = fetch
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let pageToken = "";
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(endpoint);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await request(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store", signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: { code: response.status } }));
      throw new Error(describeError(result));
    }
    const result = await response.json() as Record<string, unknown>;
    const items = result[collection];
    if (items !== undefined && (!Array.isArray(items) || items.some(item => !item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string"))) {
      throw new Error("Googleの応答形式を確認できません。保存済みの店舗選択は保持しました。");
    }
    rows.push(...(items as Record<string, unknown>[] | undefined ?? []));
    if (result.nextPageToken !== undefined && typeof result.nextPageToken !== "string") {
      throw new Error("Googleの続きの取得情報を確認できません。再取得してください。");
    }
    pageToken = (result.nextPageToken as string | undefined) ?? "";
    if (!pageToken) return rows;
    if (seen.has(pageToken)) throw new Error("Googleの候補取得が繰り返されました。保存済みの店舗選択は保持しました。");
    seen.add(pageToken);
  }
  throw new Error("Googleの候補が取得上限を超えました。保存済みの店舗選択は保持しました。運営管理者へお問い合わせください。");
}
