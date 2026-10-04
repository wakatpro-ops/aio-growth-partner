import { redirect } from "next/navigation";

// Fallback for direct route rendering; next.config also preserves incoming query strings.
export default async function LegacyReviews({ params, searchParams }: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  redirect(`/stores/${storeId}/marketing/reviews${query.size ? `?${query}` : ""}`);
}
