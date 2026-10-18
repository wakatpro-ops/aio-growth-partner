// Public page fetching (up to 14s), identity (90s), menu discovery (55s)
// leave headroom for persistence inside the 180s route. No extra attempts.
export const STORE_IDENTITY_BUDGET_MS = 90_000;
export const STORE_IDENTITY_REQUEST_MAX_MS = 60_000;

export function storeIdentityTimeoutMs(startedAt: number, now = Date.now()) {
  const remaining = STORE_IDENTITY_BUDGET_MS - Math.max(0, now - startedAt);
  return remaining >= 1_000 ? Math.min(STORE_IDENTITY_REQUEST_MAX_MS, remaining) : 0;
}
