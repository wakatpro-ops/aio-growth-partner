import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { StoreProfileForm } from "@/components/stores/store-profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isDemoStore, storeDataModeDescription, storeDataModeLabel } from "@/lib/mvp/status";
import { getStore } from "@/lib/stores";

export default async function StoreDetailPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={industry.profileLabel} description="業態別プロフィール項目と feature_flags を確認できます。" />
      <section className="card">
        <p>データ区分: <span className="badge">{storeDataModeLabel(store)}</span></p>
        <p>{storeDataModeDescription(store)}</p>
        {isDemoStore(store) ? <p className="notice danger">この店舗はデモ専用です。実店舗運用は `/stores/new` から新しい店舗を作成してください。</p> : null}
      </section>
      <StoreBusinessNav store={store} />
      <StoreProfileForm store={store} />
    </AppShell>
  );
}
