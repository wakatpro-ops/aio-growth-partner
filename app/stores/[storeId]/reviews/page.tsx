import { AiGenerator } from "@/components/ai/ai-generator";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";

export default async function ReviewsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={industry.reviewLabel} description="評価と本文から、店舗らしい返信文を生成します。" />
      <AiGenerator
        endpoint="/api/ai/review-reply"
        storeId={store.id}
        title={industry.reviewLabel}
        fields={[
          { key: "rating", label: "評価", type: "number", placeholder: "5" },
          { key: "review_text", label: "クチコミ本文", type: "textarea", placeholder: "お客様のクチコミ本文" },
          { key: "tone", label: "返信トーン", placeholder: "丁寧で温かく" }
        ]}
      />
    </AppShell>
  );
}
