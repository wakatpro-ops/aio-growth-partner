import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { MarketingDraftForm } from "@/components/phase3/marketing-draft-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getMarketingDraft } from "@/lib/phase3/marketing-data";
import { getStore } from "@/lib/stores";
import { updateMarketingDraftAction } from "../../actions";

export default async function MarketingDraftDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; draftId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { storeId, draftId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "marketing_drafts")) notFound();

  const draft = await getMarketingDraft(store.id, draftId);
  if (!draft) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const labels = { draft: store.industry_type_key === "auto_repair" ? "整備投稿下書き" : "投稿下書き" };
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={draft.title} description="投稿前の文章、画像案、行動導線を編集できます。" />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}
      <MarketingDraftForm action={updateMarketingDraftAction.bind(null, store.id, draft.id)} draft={draft} labels={labels} />
    </AppShell>
  );
}
