import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { DonutChart, HorizontalBarChart } from "@/components/ui/data-visuals";
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
  const allCustomers = await listCustomers(store.id, 2000);
  const sourceCustomers = query.segment ? await listCustomersForSegment(store.id, query.segment) : allCustomers;
  const keyword = String(query.q ?? "").trim().toLowerCase();
  const customers = keyword ? sourceCustomers.filter((customer) => [customer.name, customer.company_name, customer.phone, customer.email, customer.assigned_staff_name, ...(customer.tags ?? [])].some((value) => String(value ?? "").toLowerCase().includes(keyword))) : sourceCustomers;
  const segment = query.segment ? customerSegmentDefinition(query.segment) : null;
  const contactableCount = allCustomers.filter((customer) => !customer.do_not_contact && (customer.line_opt_in || customer.email_opt_in)).length;
  const firstVisitCount = allCustomers.filter((customer) => Number(customer.visit_count ?? 0) === 1).length;
  const repeatCount = allCustomers.filter((customer) => Number(customer.visit_count ?? 0) >= 2).length;
  const visitHistoryMissingCount = allCustomers.filter((customer) => Number(customer.visit_count ?? 0) === 0).length;
  const contactUnavailableCount = Math.max(0, allCustomers.length - contactableCount);
  const staffCounts = [...allCustomers.reduce((counts, customer) => {
    const staff = customer.assigned_staff_name?.trim() || "担当未設定";
    counts.set(staff, (counts.get(staff) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <AppShell>
      <PageHeader
        eyebrow={industry.name}
        title={industry.businessLabels.customer}
        description={segment ? `${segment.label}に該当する顧客を表示しています。` : "見積・請求と再来店支援に使う顧客情報を管理します。"}
        action={<div className="button-row"><Link className="button" href={`/stores/${store.id}/customers/new`}>{industry.businessLabels.customer}を追加</Link><Link className="button secondary" href={`/stores/${store.id}/customers/import`}>CSV・Excelで一括取込</Link></div>}
      />
      <StoreBusinessNav store={store} />
      <section className="grid cols-3">
        <article className="card"><p className="muted">登録顧客</p><div className="metric">{allCustomers.length.toLocaleString("ja-JP")}件</div><p>連絡先、来店履歴、担当者、会話メモをまとめて管理します。</p></article>
        <article className="card"><p className="muted">連絡可能</p><div className="metric">{contactableCount.toLocaleString("ja-JP")}件</div><p>配信停止を除き、メールまたはLINEの同意を確認できた顧客です。</p></article>
        <article className="card"><p className="muted">現在の絞り込み</p><div className="metric">{customers.length.toLocaleString("ja-JP")}件</div><p>{segment ? segment.label : keyword ? "検索条件に一致" : "全顧客を表示中"}</p></article>
      </section>
      <section className="visual-section">
        <div className="section-heading"><div><p className="eyebrow">顧客の傾向</p><h2>ひと目で確認</h2></div><p>登録済みの来店回数・担当者・配信同意から集計</p></div>
        <div className="visual-grid cols-3">
          <DonutChart
            title="来店状況"
            centerLabel="登録顧客"
            centerValue={`${allCustomers.length.toLocaleString("ja-JP")}人`}
            data={[
              { label: "初回来店", value: firstVisitCount, displayValue: `${firstVisitCount}人` },
              { label: "再来店", value: repeatCount, displayValue: `${repeatCount}人` },
              { label: "履歴未登録", value: visitHistoryMissingCount, displayValue: `${visitHistoryMissingCount}人` }
            ]}
            emptyMessage="来店回数を登録すると、初回・再来の割合を表示できます。"
          />
          <DonutChart
            title="連絡可否"
            centerLabel="連絡可能"
            centerValue={`${contactableCount.toLocaleString("ja-JP")}人`}
            data={[
              { label: "同意確認済み", value: contactableCount, displayValue: `${contactableCount}人` },
              { label: "未確認・停止", value: contactUnavailableCount, displayValue: `${contactUnavailableCount}人` }
            ]}
            emptyMessage="メールまたはLINEの配信同意を登録すると表示できます。"
          />
          <HorizontalBarChart
            title="担当者別の顧客数"
            data={staffCounts.map(([label, value]) => ({ label, value, displayValue: `${value}人` }))}
            emptyMessage="担当者を登録すると、担当別の顧客数を表示できます。"
          />
        </div>
        <p className="visual-guidance">「連絡可能」は、配信停止ではなく、メールまたはLINEの配信同意を確認できた顧客です。</p>
      </section>
      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">顧客業務</p><h2>目的から選ぶ</h2></div></div>
        <div className="hub-grid">
          <Link className="hub-link primary" href="#customer-list"><h3>顧客一覧を確認</h3><p>連絡先、最終来店日、来店回数、担当者、メモを確認します。</p><strong>一覧へ移動 →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/customer-segments`}><h3>顧客を分類</h3><p>来店状況や顧客属性で分け、対象に合う案内を準備します。</p><strong>セグメントを開く →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/customer-messages`}><h3>案内文を準備</h3><p>対象顧客を確認してから、メッセージ下書きと配信予定を作ります。</p><strong>下書き・配信予定へ →</strong></Link>
          <Link className="hub-link" href={`/stores/${store.id}/customers/import`}><h3>顧客データを取り込む</h3><p>CSV・Excelの列を確認し、顧客情報へまとめて反映します。</p><strong>一括取込へ →</strong></Link>
        </div>
      </section>
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
      <div className="card" id="customer-list">
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
