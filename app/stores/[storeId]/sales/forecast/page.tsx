import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listDemandForecasts } from "@/lib/phase4/demand-actions";
import { getStore } from "@/lib/stores";
import { generateDemandActionPlanAction } from "../../phase4c-actions";

function nextMonth() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function forecastLabel(type: string) {
  if (type === "growth") return "伸びそう";
  if (type === "decline") return "落ちそう";
  return "安定";
}

export default async function DemandForecastPage({
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
  if (!isFeatureEnabled(flags, "demand_forecast")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const forecasts = await listDemandForecasts(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="需要予測" description="外部売上データから、来月伸びそうな商品・サービスと落ちそうな商品・サービスを推定します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice error">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <h3>予測を生成</h3>
        <form className="form-grid" action={generateDemandActionPlanAction.bind(null, store.id, `/stores/${store.id}/sales/forecast`)}>
          <label>対象月<input name="target_month" type="month" defaultValue={nextMonth()} required /></label>
          <div className="form-actions"><button className="button" type="submit">需要予測を生成</button></div>
        </form>
      </section>

      <section className="card">
        <h3>商品・サービス別予測</h3>
        <table className="table">
          <thead><tr><th>対象月</th><th>商品・サービス</th><th>予測</th><th>直近売上</th><th>予測値</th><th>信頼度</th><th>理由</th></tr></thead>
          <tbody>
            {forecasts.map((forecast) => (
              <tr key={forecast.id}>
                <td>{forecast.target_month}</td>
                <td>{forecast.item_name}</td>
                <td>{forecastLabel(forecast.forecast_type)}</td>
                <td>{formatCurrency(forecast.current_value)}</td>
                <td>{formatCurrency(forecast.predicted_value)}</td>
                <td>{Math.round(forecast.confidence * 100)}%</td>
                <td>{forecast.reason}</td>
              </tr>
            ))}
            {forecasts.length === 0 ? <tr><td colSpan={7}>まだ需要予測がありません。売上データ取り込み後に生成してください。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
