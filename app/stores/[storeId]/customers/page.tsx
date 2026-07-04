import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";

export default async function CustomersPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const customers = await listCustomers(store.id);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.businessLabels.customer}
        description="見積書・請求書に使う顧客情報を管理します。"
        action={<Link className="button" href={`/stores/${store.id}/customers/new`}>新規追加</Link>}
      />
      <StoreBusinessNav store={store} />
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>顧客名</th>
              <th>連絡先</th>
              <th>{industry.businessLabels.vehicle ?? "補足"}</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}<br /><span className="muted">{customer.company_name}</span></td>
                <td>{customer.email}<br />{customer.phone}</td>
                <td>{Object.values(customer.vehicle_info ?? {}).filter(Boolean).join(" / ")}</td>
                <td><Link className="button secondary" href={`/stores/${store.id}/customers/${customer.id}`}>編集</Link></td>
              </tr>
            ))}
            {customers.length === 0 ? <tr><td colSpan={4}>まだ登録がありません。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
