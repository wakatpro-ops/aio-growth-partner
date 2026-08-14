import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { customerSegmentDefinition, listCustomersForSegment } from "@/lib/customer-crm";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { archiveStoreEntityAction } from "../archive-actions";

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string; archived?: string; segment?: string; q?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const { saved } = query;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const sourceCustomers = query.segment ? await listCustomersForSegment(store.id, query.segment) : await listCustomers(store.id, 2000);
  const keyword = String(query.q ?? "").trim().toLowerCase();
  const customers = keyword ? sourceCustomers.filter((customer) => [customer.name, customer.company_name, customer.phone, customer.email, customer.assigned_staff_name, ...(customer.tags ?? [])].some((value) => String(value ?? "").toLowerCase().includes(keyword))) : sourceCustomers;
  const segment = query.segment ? customerSegmentDefinition(query.segment) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.businessLabels.customer}
        description={segment ? `${segment.label}に該当する顧客を表示しています。` : "見積・請求と再来店支援に使う顧客情報を管理します。"}
        action={<div className="button-row"><Link className="button" href={`/stores/${store.id}/customers/new`}>{industry.businessLabels.customer}を追加</Link><Link className="button secondary" href={`/stores/${store.id}/customers/import`}>CSV・Excelで一括取込</Link></div>}
      />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">保存しました。AIOは顧客傾向を、再来店案内やフォロー文の提案に使いやすくなりました。</p> : null}
      {query.archived ? <p className="notice success">顧客を削除しました。</p> : null}
      <p className="notice success">
        {customers.length > 0
          ? `${industry.businessLabels.customer}が入ったため、AIは再来店案内やフォロー文の提案に顧客傾向を反映できます。`
          : `${industry.businessLabels.customer}を登録すると、AIが再来店案内やフォロー文を店舗に合わせて考えやすくなります。`}
      </p>
      <section className="card customer-toolbar">
        <div className="button-row">
          <Link className="button secondary" href={`/stores/${store.id}/customer-segments`}>顧客セグメント</Link>
          <Link className="button secondary" href={`/stores/${store.id}/customer-messages`}>メッセージ下書き・配信予定</Link>
          {segment ? <Link className="button secondary" href={`/stores/${store.id}/customers`}>絞り込みを解除</Link> : null}
        </div>
        <form className="inline-filter" method="get">
          {query.segment ? <input type="hidden" name="segment" value={query.segment} /> : null}
          <label htmlFor="q">顧客を検索</label>
          <input id="q" name="q" defaultValue={query.q ?? ""} placeholder="名前・電話・担当者・タグ" />
          <button className="button secondary" type="submit">検索</button>
        </form>
      </section>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>顧客名</th>
              <th>連絡先</th>
              <th>来店・担当</th>
              <th>配信</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}<br /><span className="muted">{customer.company_name}</span></td>
                <td>{customer.email}<br />{customer.phone}</td>
                <td>最終: {customer.last_visit_date ?? "未登録"}<br />{customer.visit_count ?? 0}回／{customer.assigned_staff_name ?? "担当未設定"}</td>
                <td>{customer.do_not_contact ? <span className="badge priority-high">配信停止</span> : <span className="badge">{[customer.line_opt_in ? "LINE" : "", customer.email_opt_in ? "メール" : ""].filter(Boolean).join("・") || "未確認"}</span>}</td>
                <td><div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/customers/${customer.id}`}>詳細・メモ</Link><Link className="button secondary" href={`/stores/${store.id}/customer-messages?customer=${customer.id}`}>案内文を作る</Link><form action={archiveStoreEntityAction.bind(null, store.id, "customer", customer.id, `/stores/${store.id}/customers`)}><ConfirmSubmitButton message={`「${customer.name}」を削除します。過去の見積・請求との関連は保持されます。`}>削除</ConfirmSubmitButton></form></div></td>
              </tr>
            ))}
            {customers.length === 0 ? <tr><td colSpan={5}>条件に合う顧客がいません。顧客を追加するか、一括取込を確認してください。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
