import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listDocuments } from "@/lib/phase2/business-data";
import { documentStatusLabels, labelFor } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";

export default async function EstimatesPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const { saved } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const estimates = await listDocuments(store.id, "estimates");

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.businessLabels.estimate}
        description="顧客向けの見積書を作成・管理します。"
        action={<Link className="button" href={`/stores/${store.id}/estimates/new`}>新規追加</Link>}
      />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">見積書を保存しました。受注化や請求書作成へつなげられます。</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>番号</th>
              <th>件名</th>
              <th>顧客</th>
              <th>合計</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((estimate) => (
              <tr key={estimate.id}>
                <td>{estimate.document_number}</td>
                <td>{estimate.title}</td>
                <td>{estimate.customer?.name ?? "未選択"}</td>
                <td>{estimate.total.toLocaleString("ja-JP")}円</td>
                <td><span className="badge">{labelFor(documentStatusLabels, estimate.status)}</span></td>
                <td><Link className="button secondary" href={`/stores/${store.id}/estimates/${estimate.id}`}>編集</Link></td>
              </tr>
            ))}
            {estimates.length === 0 ? <tr><td colSpan={6}>まだ登録がありません。最初の見積書を作ると、受注・請求までの流れを確認できます。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
