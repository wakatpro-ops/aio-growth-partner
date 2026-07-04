import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listInventoryAlerts } from "@/lib/phase4/demand-actions";
import { getStore } from "@/lib/stores";
import { generateDemandActionPlanAction } from "../../phase4c-actions";

function nextMonth() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function alertLabel(type: string) {
  if (type === "stockout_risk") return "在庫切れリスク";
  if (type === "overstock_risk") return "過剰在庫リスク";
  return "発注候補";
}

export default async function InventoryAlertsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeId } = await params;
  const { error } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "inventory_alerts")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const alerts = await listInventoryAlerts(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="在庫アラート" description="売上の伸びと現在在庫を照合し、在庫切れリスク、過剰在庫リスク、発注候補を表示します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice error">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <h3>アラートを更新</h3>
        <form className="form-grid" action={generateDemandActionPlanAction.bind(null, store.id, `/stores/${store.id}/inventory/alerts`)}>
          <label>対象月<input name="target_month" type="month" defaultValue={nextMonth()} required /></label>
          <div className="form-actions"><button className="button" type="submit">在庫アラートを生成</button></div>
        </form>
      </section>

      <section className="card">
        <h3>確認が必要な在庫</h3>
        <table className="table">
          <thead><tr><th>対象月</th><th>種類</th><th>商品・部品</th><th>現在庫</th><th>発注目安</th><th>重要度</th><th>理由</th></tr></thead>
          <tbody>
            {alerts.map((alert) => (
              <tr key={alert.id}>
                <td>{alert.target_month}</td>
                <td>{alertLabel(alert.alert_type)}</td>
                <td>{alert.item_name}</td>
                <td>{alert.current_stock.toLocaleString("ja-JP")}</td>
                <td>{alert.reorder_point.toLocaleString("ja-JP")}</td>
                <td>{alert.severity}</td>
                <td>{alert.reason}</td>
              </tr>
            ))}
            {alerts.length === 0 ? <tr><td colSpan={7}>在庫アラートはまだありません。需要予測と合わせて生成してください。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
