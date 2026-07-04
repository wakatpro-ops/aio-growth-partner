import { AppShell } from "@/components/layout/app-shell";
import { ItemForm } from "@/components/phase2/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { createItemAction } from "../../business/actions";

export default async function NewItemPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={`${industry.businessLabels.item}を追加`} description="単価、税率、在庫管理の有無を登録します。" />
      <ItemForm action={createItemAction.bind(null, store.id)} labels={industry.businessLabels} />
    </AppShell>
  );
}
