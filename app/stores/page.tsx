import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { isDemoStore, storeDataModeDescription, storeDataModeLabel } from "@/lib/mvp/status";
import { listStores } from "@/lib/stores";

export default async function StoresPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const stores = await listStores();
  if (!access.isPlatformAdmin && stores.length === 1) {
    redirect(`/stores/${stores[0].id}`);
  }

  return (
    <AppShell>
      <PageHeader
        title={access.isPlatformAdmin ? "店舗一覧" : "利用店舗の選択"}
        description={access.isPlatformAdmin ? "管理者として、利用中の店舗を確認できます。" : "利用する店舗を選んで、店舗AIホームへ進みます。"}
        action={access.isPlatformAdmin ? <Link className="button" href="/admin/stores">管理者用店舗一覧</Link> : undefined}
      />
      {access.isPlatformAdmin ? (
        <p className="notice success">管理者として表示しています。一般ユーザーには、自分が所属する店舗だけが表示されます。</p>
      ) : null}
      <div className="card">
        {stores.length === 0 ? (
          <div className="empty">
            <h2>利用できる店舗を準備しています</h2>
            <p>店舗情報が紐づくと、ここから店舗AIホームへ進めます。担当者からの案内に沿って初回設定を進めてください。</p>
            <div className="button-row">
              <Link className="button secondary" href="/onboarding">初回導入を確認</Link>
              <Link className="button secondary" href="/help">操作方法を見る</Link>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>店舗名</th>
                <th>区分</th>
                <th>業態</th>
                <th>説明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const industry = getIndustryConfig(store.industry_type_key);
                return (
                  <tr key={store.id}>
                    <td><strong>{store.name}</strong></td>
                    <td><span className={isDemoStore(store) ? "badge" : "badge badge-strong"}>{storeDataModeLabel(store)}</span></td>
                    <td><span className="badge">{industry.name}</span></td>
                    <td><p className="muted">{storeDataModeDescription(store)}</p></td>
                    <td><Link className="button secondary" href={`/stores/${store.id}`}>店舗AIホームを開く</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
