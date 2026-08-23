export type PostLoginDestinationInput = {
  isPlatformAdmin: boolean;
  onboardingStoreId?: string | null;
};

export function resolvePostLoginDestination({
  isPlatformAdmin,
  onboardingStoreId
}: PostLoginDestinationInput) {
  if (isPlatformAdmin) return "/admin";
  if (onboardingStoreId) {
    return `/onboarding/setup-review?storeId=${encodeURIComponent(onboardingStoreId)}`;
  }
  return "/dashboard";
}
