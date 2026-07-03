import { getIndustryConfig } from "@/config/industries";
import type { FeatureFlags, Store } from "@/types/domain";

export function resolveFeatureFlags(store: Pick<Store, "industry_type_key" | "feature_flags">): FeatureFlags {
  const industry = getIndustryConfig(store.industry_type_key);
  return {
    ...industry.defaultFeatureFlags,
    ...store.feature_flags
  };
}

export function isFeatureEnabled(flags: FeatureFlags, key: string): boolean {
  return Boolean(flags[key]);
}
