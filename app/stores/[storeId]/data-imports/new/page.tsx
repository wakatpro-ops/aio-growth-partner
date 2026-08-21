import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { GoogleSheetImportForm, ImportUploadForm } from "@/components/phase4/import-forms";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getStore } from "@/lib/stores";
import { uploadGoogleSheetAction, uploadImportFileAction } from "../actions";

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
      <PageHeader eyebrow={industry.name} title="売上データを取り込む" description="CSV・Excel・PDF・Googleスプレッドシートを、確認してから安全に取り込みます。" />
      <StoreBusinessNav store={store} />
      {error ? <div className="notice danger">{decodeURIComponent(error)}</div> : null}
      <p className="notice">売上・経費・顧客などが混ざっている場合や、マクロ付きExcelを複数シートまとめて解析する場合は、<Link href={`/stores/${store.id}/data-imports/ai`}>AIデータ取込</Link>を利用してください。</p>
      <ImportUploadForm action={uploadImportFileAction.bind(null, store.id)} />
      <GoogleSheetImportForm action={uploadGoogleSheetAction.bind(null, store.id)} />
    </AppShell>
  );
}
