import { AiGenerator } from "@/components/ai/ai-generator";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";

export default async function DiagnosisPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={industry.diagnosisLabel} description="店舗プロフィールをもとにAIO観点の改善案を出します。" />
      <AiGenerator
        endpoint="/api/ai/diagnosis"
        storeId={store.id}
        title={industry.diagnosisLabel}
        fields={[
          { key: "focus", label: "重点診断テーマ", placeholder: "地域集客、クチコミ、サービス説明など" },
          { key: "notes", label: "補足", type: "textarea", placeholder: "気になっている課題や改善したい点" }
        ]}
      />
    </AppShell>
  );
}
