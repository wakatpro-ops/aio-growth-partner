export type PostLoginDestinationInput = {
  isPlatformAdmin: boolean;
  /** Only set for an explicitly requested, authorized invitation setup flow. */
  initialSetupStoreId?: string | null;
  accessibleStoreIds?: string[];
  lastStoreId?: string | null;
};

export function resolvePostLoginDestination({
  isPlatformAdmin,
  initialSetupStoreId,
  accessibleStoreIds = [],
  lastStoreId
}: PostLoginDestinationInput) {
  if (isPlatformAdmin) return "/admin";

  const storeIds = [...new Set(accessibleStoreIds.map(String).filter(Boolean))];
  if (initialSetupStoreId && storeIds.includes(initialSetupStoreId)) {
    return `/onboarding/setup-review?storeId=${encodeURIComponent(initialSetupStoreId)}`;
  }
  if (storeIds.length === 0) return "/no-store";
  if (storeIds.length === 1) return `/stores/${encodeURIComponent(storeIds[0])}`;
  if (lastStoreId && storeIds.includes(lastStoreId)) {
    return `/stores/${encodeURIComponent(lastStoreId)}`;
  }
  return "/stores";
}

/** A password reset is never a request to restart initial setup. */
export function initialSetupStoreIdFromInvite(next: string, recoveryMode: boolean): string | null {
  if (recoveryMode || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  try {
    const url = new URL(next, "https://app.aioboost.jp");
    if (url.pathname !== "/onboarding/setup-review") return null;
    const storeId = url.searchParams.get("storeId");
    return storeId && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(storeId) ? storeId : null;
  } catch {
    return null;
  }
}
