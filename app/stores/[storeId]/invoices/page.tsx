import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listDocuments } from "@/lib/phase2/business-data";
import { documentStatusLabels, labelFor, paymentStatusLabels } from "@/lib/status-labels";
import { getStore } from "@/lib/stores";

export default async function InvoicesPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const { saved } = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const invoices = await listDocuments(store.id, "invoices");

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.businessLabels.invoice}
        description="請求書の発行状況と金額を管理します。"
        action={<Link className="button" href={`/stores/${store.id}/invoices/new`}>新規追加</Link>}
      />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">請求書を保存しました。入金管理や会計CSVに使える情報が増えました。</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>番号</th>
              <th>件名</th>
              <th>顧客</th>
              <th>合計</th>
              <th>状態</th>
              <th>入金</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.document_number}</td>
                <td>{invoice.title}</td>
                <td>{invoice.customer?.name ?? "未選択"}</td>
                <td>{invoice.total.toLocaleString("ja-JP")}円</td>
                <td><span className="badge">{labelFor(documentStatusLabels, invoice.status)}</span></td>
                <td><span className="badge">{labelFor(paymentStatusLabels, invoice.payment_status)}</span></td>
                <td><Link className="button secondary" href={`/stores/${store.id}/invoices/${invoice.id}`}>編集</Link></td>
              </tr>
            ))}
            {invoices.length === 0 ? <tr><td colSpan={7}>まだ登録がありません。最初の請求書を作ると、入金管理と売上確認を始められます。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
