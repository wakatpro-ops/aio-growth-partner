import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ImportUploadForm } from "@/components/phase4/import-forms";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getStore } from "@/lib/stores";
import { uploadImportFileAction } from "../actions";

export default async function NewDataImportPage({
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
  if (!isFeatureEnabled(flags, "data_imports")) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="売上データを取り込む" description="CSV / Excelをアップロードし、取り込み前に内容と列マッピングを確認します。" />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}
      <ImportUploadForm action={uploadImportFileAction.bind(null, store.id)} />
    </AppShell>
  );
}
