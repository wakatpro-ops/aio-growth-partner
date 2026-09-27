import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/lib/auth/post-login";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { listStores } from "@/lib/stores";

export default async function DashboardPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");
  if (access.isPlatformAdmin) redirect("/admin");

  const [stores, cookieStore] = await Promise.all([listStores(), cookies()]);
  // This is a daily entry point, not an invitation/setup continuation.
  redirect(resolvePostLoginDestination({
    isPlatformAdmin: false,
    accessibleStoreIds: stores.filter((store) => store.status === "active").map((store) => store.id),
    lastStoreId: cookieStore.get("aio_last_store_id")?.value ?? null
  }));
}
