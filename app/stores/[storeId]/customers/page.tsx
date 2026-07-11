import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const { saved } = await searchParams;
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
      {saved ? <p className="notice success">保存しました。AIOは顧客傾向を、再来店案内やフォロー文の提案に使いやすくなりました。</p> : null}
      <p className="notice success">
        {customers.length > 0
          ? `${industry.businessLabels.customer}が入ったため、AIは再来店案内やフォロー文の提案に顧客傾向を反映できます。`
          : `${industry.businessLabels.customer}を登録すると、AIが再来店案内やフォロー文を店舗に合わせて考えやすくなります。`}
      </p>
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
            {customers.length === 0 ? <tr><td colSpan={4}>まだ登録がありません。最初の顧客を追加すると、見積・請求とフォロー提案の土台になります。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
