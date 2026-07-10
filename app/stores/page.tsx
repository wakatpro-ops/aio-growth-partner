import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { isDemoStore, storeDataModeDescription, storeDataModeLabel } from "@/lib/mvp/status";
import { listStores } from "@/lib/stores";

export default async function StoresPage() {
  const stores = await listStores();

  return (
    <AppShell>
      <PageHeader
        title="複数店舗管理"
        description="1つの組織の中で複数店舗を管理します。デモ店舗と実店舗は区別して扱います。"
        action={<Link className="button" href="/stores/new">実店舗を追加</Link>}
      />
      <section className="grid cols-2">
        <article className="card">
          <h2>実店舗</h2>
          <p>顧客、請求、入金、Google連携情報を本番運用として扱う店舗です。</p>
        </article>
        <article className="card">
          <h2>デモ店舗</h2>
          <p>機能説明と検証用です。実ユーザーの請求・顧客・連携データとは混ぜないでください。</p>
        </article>
      </section>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>店舗名</th>
              <th>区分</th>
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
                  <td>
                    <strong>{store.name}</strong>
                    <p className="muted">{storeDataModeDescription(store)}</p>
                  </td>
                  <td><span className={isDemoStore(store) ? "badge" : "badge badge-strong"}>{storeDataModeLabel(store)}</span></td>
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
