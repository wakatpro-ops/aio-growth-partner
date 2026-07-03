import { AiGenerator } from "@/components/ai/ai-generator";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";

export default async function PostsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={industry.postLabel} description="業態別プロンプトテンプレートを使って投稿文を生成します。" />
      <AiGenerator
        endpoint="/api/ai/post"
        storeId={store.id}
        title={industry.postLabel}
        fields={[
          { key: "purpose", label: "投稿目的", placeholder: "キャンペーン告知、来店促進など" },
          { key: "campaign", label: "内容", type: "textarea", placeholder: "伝えたい内容を入力" },
          { key: "tone", label: "文体", placeholder: "親しみやすく、丁寧に" }
        ]}
      />
    </AppShell>
  );
}
