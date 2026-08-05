import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { listArchivedStoreRecords } from "@/lib/archive-management";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { restoreStoreEntityAction } from "../archive-actions";

export default async function StoreArchivesPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ restored?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const records = await listArchivedStoreRecords(store.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="アーカイブ管理" description="整理したデータを確認し、必要なものを元の一覧へ復元できます。" />
      <StoreBusinessNav store={store} />
      {query.restored ? <p className="notice success">データを復元しました。</p> : null}
      <p className="notice">アーカイブは物理削除ではありません。請求・入金・監査などの関連履歴は保持されます。</p>
      <section className="card">
        <table className="table">
          <thead><tr><th>種類</th><th>名称</th><th>アーカイブ日時</th><th>操作</th></tr></thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.entity}:${record.id}`}>
                <td><span className="badge">{record.entityLabel}</span></td>
                <td>{record.label}</td>
                <td>{new Date(record.archivedAt).toLocaleString("ja-JP")}</td>
                <td><form action={restoreStoreEntityAction.bind(null, store.id, record.entity, record.id)}><button className="button secondary" type="submit">復元</button></form></td>
              </tr>
            ))}
            {records.length === 0 ? <tr><td colSpan={4}>アーカイブ済みのデータはありません。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
