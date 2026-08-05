import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { isDemoStore, storeDataModeDescription, storeDataModeLabel } from "@/lib/mvp/status";
import { listStores } from "@/lib/stores";
import { archiveStoreAction, restoreStoreAction } from "./actions";

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ view?: string; archived?: string; restored?: string }> }) {
  const query = await searchParams;
  const showArchived = query.view === "archived";
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const allStores = await listStores({ includeArchived: showArchived });
  const stores = allStores.filter((store) => showArchived ? Boolean(store.archived_at) : !store.archived_at);
  if (!showArchived && !access.isPlatformAdmin && stores.length === 1) {
    redirect(`/stores/${stores[0].id}`);
  }

  return (
    <AppShell>
      <PageHeader
        title={access.isPlatformAdmin ? "店舗一覧" : "利用店舗の選択"}
        description={access.isPlatformAdmin ? "管理者として、利用中の店舗を確認できます。" : "利用する店舗を選んで、店舗AIホームへ進みます。"}
        action={access.isPlatformAdmin ? <Link className="button" href="/admin/stores">管理者用店舗一覧</Link> : undefined}
      />
      {query.archived ? <p className="notice success">店舗をアーカイブしました。関連データは保持され、必要なら復元できます。</p> : null}
      {query.restored ? <p className="notice success">店舗を復元しました。</p> : null}
      {access.isPlatformAdmin ? (
        <p className="notice success">管理者として表示しています。一般ユーザーには、自分が所属する店舗だけが表示されます。</p>
      ) : null}
      <div className="button-row">
        <Link className={`button ${showArchived ? "secondary" : ""}`} href="/stores">利用中</Link>
        <Link className={`button ${showArchived ? "" : "secondary"}`} href="/stores?view=archived">アーカイブ済み</Link>
      </div>
      <div className="card">
        {stores.length === 0 ? (
          <div className="empty">
            <h2>{showArchived ? "アーカイブ済みの店舗はありません" : "利用できる店舗を準備しています"}</h2>
            <p>{showArchived ? "整理した店舗はここに表示され、いつでも復元できます。" : "店舗情報が紐づくと、ここから店舗AIホームへ進めます。担当者からの案内に沿って初回設定を進めてください。"}</p>
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
                    <td>
                      <div className="button-row">
                        {!showArchived ? <Link className="button secondary" href={`/stores/${store.id}`}>店舗AIホームを開く</Link> : null}
                        {access.isPlatformAdmin || access.organizationRoles[store.organization_id] === "org_owner" ? (
                          showArchived ? (
                            <form action={restoreStoreAction.bind(null, store.id)}><button className="button secondary" type="submit">復元</button></form>
                          ) : (
                            <form action={archiveStoreAction.bind(null, store.id)}>
                              <ConfirmSubmitButton message={`「${store.name}」をアーカイブします。通常の店舗一覧と集計から非表示になりますが、データは削除されません。`}>アーカイブ</ConfirmSubmitButton>
                            </form>
                          )
                        ) : null}
                      </div>
                    </td>
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
