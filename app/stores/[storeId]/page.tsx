import { StoreCommandCenterView } from "@/components/dashboard/store-command-center";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getStoreCommandCenter } from "@/lib/store-command-center";

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const dashboard = await getStoreCommandCenter(storeId);

  return (
    <AppShell>
      <PageHeader
        eyebrow={dashboard.industryName}
        title={`${dashboard.store.name} 店舗トップ`}
        description="売上・在庫・口コミ・集客を横断し、今日確認することを実データから整理します。"
      />
      <StoreCommandCenterView dashboard={dashboard} />
    </AppShell>
  );
}
