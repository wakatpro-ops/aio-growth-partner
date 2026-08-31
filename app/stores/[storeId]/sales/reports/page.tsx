import { notFound, redirect } from "next/navigation";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getStore } from "@/lib/stores";

export default async function SalesReportsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "sales_reports")) notFound();
  redirect(`/stores/${store.id}/sales-hub#reports`);
}
