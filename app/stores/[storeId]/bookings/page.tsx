import { redirect } from "next/navigation";
import { getStore } from "@/lib/stores";

/** Keep existing bookmarks, lifecycle redirects and period links working. */
export default async function BookingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const query = await searchParams;
  const next = new URLSearchParams({ tab: "bookings" });
  for (const key of ["view", "date", "saved", "deleted", "error"]) {
    const value = query[key];
    if (typeof value === "string") next.set(key, key === "view" && value === "today" ? "day" : value);
  }
  redirect(`/stores/${store.id}/customers?${next.toString()}`);
}
