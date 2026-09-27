import { StoreCommandCenterView } from "@/components/dashboard/store-command-center";
import { AppShell } from "@/components/layout/app-shell";
import { getStoreCommandCenter } from "@/lib/store-command-center";

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const dashboard = await getStoreCommandCenter(storeId);

  return (
    <AppShell>
      <h1 className="sr-only">店舗トップ</h1>
      <StoreCommandCenterView dashboard={dashboard} />
    </AppShell>
  );
}
