import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { MarketingDraftForm, MarketingDraftGenerateForm } from "@/components/phase3/marketing-draft-form";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getStore } from "@/lib/stores";
import { createMarketingDraftAction, generateMarketingDraftAction } from "../../actions";

export default async function NewMarketingDraftPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "marketing_drafts")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const labels = { draft: store.industry_type_key === "auto_repair" ? "整備投稿下書き" : "投稿下書き" };
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={`${labels.draft}を作成`} description="AI生成または手入力で投稿下書きを保存します。" />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}
      <MarketingDraftGenerateForm
        action={generateMarketingDraftAction.bind(null, store.id)}
        isGoogleEnabled={isFeatureEnabled(flags, "google_business_profile_draft")}
      />
      <MarketingDraftForm action={createMarketingDraftAction.bind(null, store.id)} labels={labels} />
    </AppShell>
  );
}
