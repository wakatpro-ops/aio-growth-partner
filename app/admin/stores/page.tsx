import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { listStores } from "@/lib/stores";

export default async function AdminStoresPage() {
  const stores = await listStores();
  return (
    <AppShell>
      <PageHeader title="店舗管理" description="店舗ごとの industry_type と feature_flags を確認します。" />
      <section className="card">
        <table className="table">
          <tbody>
            {stores.map((store) => (
              <tr key={store.id}>
                <td>{store.name}</td>
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
