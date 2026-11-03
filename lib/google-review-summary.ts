export type GoogleReviewSummary = {
  averageRating: number | null;
  totalReviewCount: number;
  locationName: string;
  syncedAt: string;
};

/** Use Google's all-review aggregate, never the average of a limited preview. */
export function googleReviewSummary(payload: Record<string, unknown>, locationName: string, syncedAt: string): GoogleReviewSummary | null {
  const count = payload.totalReviewCount;
  const rating = payload.averageRating;
  if (!Number.isSafeInteger(count) || typeof count !== "number" || count < 0 || !locationName || !Number.isFinite(Date.parse(syncedAt))) return null;
  if (count === 0) return rating === undefined || rating === null || rating === 0 ? { averageRating: null, totalReviewCount: 0, locationName, syncedAt } : null;
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return { averageRating: rating, totalReviewCount: count, locationName, syncedAt };
}

export function storedGoogleReviewSummary(metadata: Record<string, unknown> | null | undefined, locationName: string) {
  const value = metadata?.review_summary;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  if (saved.locationName !== locationName || typeof saved.syncedAt !== "string") return null;
  return googleReviewSummary(saved, locationName, saved.syncedAt);
}
