import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getStore } from "@/lib/stores";

export default async function MarketingCalendarPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "marketing_drafts")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title="投稿カレンダー"
        description="Phase 3では設計枠として用意し、今後の予約投稿・承認フローに接続できるようにしています。"
      />
      <StoreBusinessNav store={store} />
      <section className="card">
        <h3>今後の拡張予定</h3>
        <p>投稿予定日、投稿先、承認状態、配信結果をここに集約します。現在は投稿下書きの保存・管理を優先しています。</p>
      </section>
    </AppShell>
  );
}
