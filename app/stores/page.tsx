import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { listStores } from "@/lib/stores";

export default async function StoresPage() {
  const stores = await listStores();

  return (
    <AppShell>
      <PageHeader
        title="複数店舗管理"
        description="1つの組織の中で複数店舗を管理し、店舗ごとに業態と有効機能を切り替えます。"
        action={<Link className="button" href="/stores/new">店舗追加</Link>}
      />
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>店舗名</th>
              <th>業態</th>
              <th>有効機能</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => {
              const industry = getIndustryConfig(store.industry_type_key);
              const flags = resolveFeatureFlags(store);
              return (
                <tr key={store.id}>
                  <td>{store.name}</td>
                  <td><span className="badge">{industry.name}</span></td>
                  <td>{Object.entries(flags).filter(([, enabled]) => enabled).map(([key]) => key).join(", ")}</td>
                  <td><Link className="button secondary" href={`/stores/${store.id}`}>開く</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
