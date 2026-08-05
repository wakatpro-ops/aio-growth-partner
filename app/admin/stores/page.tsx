import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { storeDataModeLabel } from "@/lib/mvp/status";
import { listStores } from "@/lib/stores";
import { archiveAdminStoreAction, restoreAdminStoreAction } from "./actions";

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<{ view?: string; archived?: string; restored?: string }> }) {
  const query = await searchParams;
  const showArchived = query.view === "archived";
  const allStores = await listStores({ includeArchived: showArchived, includeDemo: true });
  const stores = allStores.filter((store) => showArchived ? Boolean(store.archived_at) : !store.archived_at);
  return (
    <AppShell>
      <PageHeader title="店舗管理" description="店舗を確認し、不要な店舗は関連データを残したままアーカイブできます。" />
      {query.archived ? <p className="notice success">店舗をアーカイブしました。</p> : null}
      {query.restored ? <p className="notice success">店舗を復元しました。</p> : null}
      <div className="button-row">
        <Link className={`button ${showArchived ? "secondary" : ""}`} href="/admin/stores">利用中</Link>
        <Link className={`button ${showArchived ? "" : "secondary"}`} href="/admin/stores?view=archived">アーカイブ済み</Link>
      </div>
      <section className="card">
        <table className="table">
          <thead>
            <tr><th>店舗名</th><th>区分</th><th>業態</th><th>状態</th><th>操作</th></tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.id}>
                <td>{store.name}</td>
                <td><span className="badge">{storeDataModeLabel(store)}</span></td>
                <td>{store.industry_type_key}</td>
                <td>{showArchived ? "アーカイブ済み" : store.status}</td>
                <td>
                  {showArchived ? (
                    <form action={restoreAdminStoreAction.bind(null, store.id)}><button className="button secondary" type="submit">復元</button></form>
                  ) : (
                    <form action={archiveAdminStoreAction.bind(null, store.id)}>
                      <ConfirmSubmitButton message={`「${store.name}」をアーカイブします。ユーザーの通常一覧と集計から外れますが、関連データは保持されます。`}>アーカイブ</ConfirmSubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {stores.length === 0 ? <tr><td colSpan={5}>{showArchived ? "アーカイブ済みの店舗はありません。" : "利用中の店舗はありません。"}</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
