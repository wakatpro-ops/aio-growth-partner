import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ItemForm } from "@/components/phase2/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getBusinessItem } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { deleteItemAction, updateItemAction } from "../../business/actions";

export default async function ItemDetailPage({ params }: { params: Promise<{ storeId: string; itemId: string }> }) {
  const { storeId, itemId } = await params;
  const store = await getStore(storeId);
  const item = await getBusinessItem(store.id, itemId);
  if (!item) notFound();

  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={item.name} description={`${industry.businessLabels.item}の内容を編集します。`} />
      <ItemForm action={updateItemAction.bind(null, store.id, item.id)} item={item} labels={industry.businessLabels} />
      <form action={deleteItemAction.bind(null, store.id, item.id)} className="danger-zone">
        <button className="button danger" type="submit">削除</button>
      </form>
    </AppShell>
  );
}
