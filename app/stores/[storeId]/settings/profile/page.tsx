import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { StoreProfileForm } from "@/components/stores/store-profile-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { updateStoreProfileAction } from "./actions";

export default async function StoreProfilePage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  return (
    <AppShell>
      <PageHeader eyebrow="設定" title="店舗プロフィール" description={`${industry.name}としてAIやお客様に伝える基本情報を編集します。`} />
      <StoreBusinessNav store={store} />
      {query.saved ? <p className="notice success">店舗情報を保存しました。AIO改善にも反映されています。</p> : null}
      <StoreProfileForm store={store} action={updateStoreProfileAction.bind(null, store.id)} />
    </AppShell>
  );
}
