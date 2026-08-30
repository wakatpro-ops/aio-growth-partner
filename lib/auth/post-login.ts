export type PostLoginDestinationInput = {
  isPlatformAdmin: boolean;
  onboardingStoreId?: string | null;
  accessibleStoreIds?: string[];
  lastStoreId?: string | null;
};

export function resolvePostLoginDestination({
  isPlatformAdmin,
  onboardingStoreId,
  accessibleStoreIds = [],
  lastStoreId
}: PostLoginDestinationInput) {
  if (isPlatformAdmin) return "/admin";

  const storeIds = [...new Set(accessibleStoreIds.map(String).filter(Boolean))];
  if (onboardingStoreId && storeIds.includes(onboardingStoreId)) {
    return `/onboarding/setup-review?storeId=${encodeURIComponent(onboardingStoreId)}`;
  }
  if (storeIds.length === 0) return "/no-store";
  if (storeIds.length === 1) return `/stores/${encodeURIComponent(storeIds[0])}`;
  if (lastStoreId && storeIds.includes(lastStoreId)) {
    return `/stores/${encodeURIComponent(lastStoreId)}`;
  }
  return "/stores";
}
