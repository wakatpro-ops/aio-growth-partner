import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listBusinessItems } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";

export default async function ItemsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const items = await listBusinessItems(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.businessLabels.item}
        description="業態ごとの呼び名に合わせて、商品・部品・サービスを管理します。"
        action={<Link className="button" href={`/stores/${store.id}/items/new`}>新規追加</Link>}
      />
      <StoreBusinessNav store={store} />
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>種別</th>
              <th>単価</th>
              <th>在庫</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}<br /><span className="muted">{item.sku}</span></td>
                <td><span className="badge">{industry.businessLabels[item.item_type]}</span></td>
                <td>{item.unit_price.toLocaleString("ja-JP")}円 / {item.unit}</td>
                <td>{item.is_stock_managed ? "管理する" : "対象外"}</td>
                <td>{item.status === "active" ? "有効" : "停止"}</td>
                <td><Link className="button secondary" href={`/stores/${store.id}/items/${item.id}`}>編集</Link></td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr><td colSpan={6}>まだ登録がありません。</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
