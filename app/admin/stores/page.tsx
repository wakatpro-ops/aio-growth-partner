import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { storeDataModeLabel } from "@/lib/mvp/status";
import { listStores } from "@/lib/stores";

export default async function AdminStoresPage() {
  const stores = await listStores();
  return (
    <AppShell>
      <PageHeader title="店舗管理" description="店舗ごとの区分、industry_type、feature_flags を確認します。" />
      <section className="card">
        <table className="table">
          <thead>
            <tr><th>店舗名</th><th>区分</th><th>業態</th><th>状態</th></tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id}>
                <td>{store.name}</td>
                <td><span className="badge">{storeDataModeLabel(store)}</span></td>
                <td>{store.industry_type_key}</td>
                <td>{store.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
