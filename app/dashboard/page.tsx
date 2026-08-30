import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePostLoginDestination } from "@/lib/auth/post-login";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { listStores } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function DashboardPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");
  if (access.isPlatformAdmin) redirect("/admin");

  const [stores, cookieStore] = await Promise.all([listStores(), cookies()]);
  const supabase = createSupabaseAdminClient();
  const { data: onboardingApplication } = supabase
    ? await supabase.from("applications")
      .select("store_id, onboarding_status")
      .eq("invited_user_id", access.userId)
      .not("store_id", "is", null)
      .neq("onboarding_status", "completed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null };

  redirect(resolvePostLoginDestination({
    isPlatformAdmin: false,
    onboardingStoreId: onboardingApplication?.store_id ? String(onboardingApplication.store_id) : null,
    accessibleStoreIds: stores.map((store) => store.id),
    lastStoreId: cookieStore.get("aio_last_store_id")?.value ?? null
  }));
}
