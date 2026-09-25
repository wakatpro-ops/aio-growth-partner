import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { DonutChart, HorizontalBarChart } from "@/components/ui/data-visuals";
import { DataPreview } from "@/components/ui/data-preview";
import { BookingCalendar } from "@/components/customers/booking-calendar";
import { AskAboutCustomers } from "@/components/customers/ask-about-customers";
import { BookingList } from "@/components/bookings/booking-list";
import { getIndustryConfig } from "@/config/industries";
import { customerMatchesSegment } from "@/lib/customer-crm";
import { bookingWorkbenchCounts, listCalendarBookings, listBookings, type BookingListView } from "@/lib/bookings";
import { readCustomerWorkbench } from "@/lib/customer-workbench";
import { calendarDays, customerWorkLabels, dataState, japanDay, recencyGroup, shiftDay, validDay, visitGroup } from "@/lib/customer-workbench-rules";
import { canEditStore } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { archiveStoreEntityAction } from "../archive-actions";

type Query = { tab?: string; view?: string; date?: string; saved?: string; archived?: string; deleted?: string; error?: string; segment?: string; q?: string; group?: string; recency?: string };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<Query> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const editable = await canEditStore(store.id, store.organization_id);
  const industry = getIndustryConfig(store.industry_type_key);
  const labels = customerWorkLabels(store.industry_type_key);
  const base = `/stores/${store.id}`;
  const tab = query.tab === "analysis" ? "analysis" : query.tab === "customers" || query.q || query.segment || query.group || query.recency ? "customers" : "bookings";
  const [workspace, counts] = await Promise.all([readCustomerWorkbench(store.id), bookingWorkbenchCounts(store.id)]);
  const allCustomers = workspace.customers;
  const keyword = (query.q ?? "").trim().toLowerCase();
  const customers = allCustomers.filter(customer => (!query.segment || customerMatchesSegment(customer, query.segment))
    && (!query.group || visitGroup(customer.visit_count) === query.group)
    && (!query.recency || recencyGroup(customer.last_visit_date) === query.recency)
    && (!keyword || [customer.name, customer.company_name, customer.phone, customer.email, customer.assigned_staff_name, ...(customer.tags ?? [])].some(value => String(value ?? "").toLowerCase().includes(keyword))));
  const customerState = dataState(workspace.total, allCustomers.length, customers.length);
  const day = validDay(query.date);
  const view = ["day", "week", "upcoming", "past", "deleted"].includes(query.view ?? "") ? query.view! : "week";
  const days = calendarDays(day, view === "week");
  const isCalendar = view === "week" || view === "day";
  const bookings = tab !== "bookings" ? [] : isCalendar
    ? await listCalendarBookings(store.id, `${days[0]}T00:00:00+09:00`, `${shiftDay(days[days.length - 1], 1)}T00:00:00+09:00`)
    : await listBookings(store.id, view as BookingListView);
  const contactable = allCustomers.filter(c => !c.do_not_contact && (c.line_opt_in || c.email_opt_in)).length;
  const visitGroups = [["first", `初回${labels.visit}`], ["repeat", `再${labels.visit}`], ["unknown", "履歴未登録"]] as const;
  const recencyGroups = [["recent", "30日未満"], ["middle", "30〜89日"], ["long", "90日以上"], ["unknown", "未登録・要確認"]] as const;
  const calendarHref = (next: string) => `${base}/customers?tab=bookings&view=${view}&date=${next}`;

  return <AppShell>
    <PageHeader eyebrow={industry.name} title={`予約・${industry.businessLabels.customer}`} description="予約の確認、お客様の情報、次のフォローをひとつの画面で。" action={<AskAboutCustomers />} />
    <nav className="workbench-tabs" aria-label="予約・顧客・分析の切り替え">
      {[["bookings", "予約"], ["customers", industry.businessLabels.customer], ["analysis", "分析・フォロー"]].map(([key, label]) => <Link key={key} href={`${base}/customers?tab=${key}`} aria-current={tab === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    {query.saved ? <p className="notice success">保存しました。</p> : null}
    {query.archived || query.deleted ? <p className="notice success">削除しました。削除済みから元に戻せます。</p> : null}
    {query.error ? <p className="notice danger">{query.error}</p> : null}
    <div className="workbench-kpis" aria-label="現在の登録状況">
      {tab === "bookings" ? <><div><span>今日の予約</span><strong>{counts.today}件</strong><small>キャンセル・無断キャンセルを除く</small></div><div><span>今後の確定予約</span><strong>{counts.upcoming}件</strong><small>明日以降</small></div></> : <><div><span>登録{industry.businessLabels.customer}</span><strong>{allCustomers.length}件</strong></div><div><span>配信同意確認済み</span><strong>{contactable}件</strong><small>実際の送信可否は連絡先・接続も要確認</small></div></>}
    </div>

    {tab === "bookings" ? <>
      <div className="workbench-actions button-row">
        {editable ? <><Link className="button" href={`${base}/bookings/new`}>予約を登録</Link><Link className="button secondary" href={`${base}/bookings/settings`}>予約内容・担当・設備</Link></> : <span className="badge">閲覧のみ</span>}
        <Link className="button secondary" href={`${base}/customers?tab=bookings&view=deleted`}>削除済み</Link>
        {editable ? <details><summary>連携・移行</summary><div className="button-row"><Link href={`${base}/bookings/line`}>LINE予約</Link><Link href={`${base}/bookings/migration`}>既存LINE予約から移行</Link><Link href={`${base}/bookings/integrations`}>外部予約サービス</Link><Link href={`${base}/ai-inbox`}>店舗メールの取り込み</Link></div></details> : null}
      </div>
      <section className="card workbench-bookings">
        <nav className="booking-tabs" aria-label="予約期間">{[["day", "日"], ["week", "週"], ["upcoming", "今後"], ["past", "過去"]].map(([key, label]) => <Link key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} href={`${base}/customers?tab=bookings&view=${key}&date=${day}`}>{label}</Link>)}</nav>
        {isCalendar ? <div className="workbench-date"><Link className="button secondary" href={calendarHref(shiftDay(day, view === "week" ? -7 : -1))}>← 前へ</Link><form method="get"><input type="hidden" name="tab" value="bookings"/><input type="hidden" name="view" value={view}/><label>表示日<input type="date" name="date" defaultValue={day} required /></label><button className="button secondary">表示</button></form><Link className="button secondary" href={calendarHref(japanDay())}>今日</Link><Link className="button secondary" href={calendarHref(shiftDay(day, view === "week" ? 7 : 1))}>次へ →</Link></div> : <h2>{view === "deleted" ? "削除済み" : view === "past" ? "過去" : "今後"}の予約</h2>}
        {counts.total === 0 && view !== "deleted" ? <DataPreview kind="calendar" title="予約が入ると、予定がひと目で分かります" description="予約を登録するか、店舗メールの転送・外部予約の接続を設定してください。日時・お客様・担当をまとめて確認できます。" importHref={editable ? `${base}/bookings/integrations` : undefined} manualHref={editable ? `${base}/bookings/new` : undefined} /> : <>
          {counts.active === 0 && counts.total > 0 && view !== "deleted" ? <p className="notice">登録済みの予約はすべて削除済みです。「削除済み」から確認・復元できます。</p> : null}
          {isCalendar ? <BookingCalendar storeId={store.id} days={days} bookings={bookings}/> : <><BookingList storeId={store.id} bookings={bookings} deleted={view === "deleted"}/><p className="muted">最大300件を表示。期間を指定した日・週表示でも確認できます。</p></>}
        </>}
      </section>
      <p className="muted">外部予約の連携状態は媒体ごとに異なります。この画面で空き枠の保証や外部への自動書き戻しは行いません。</p>
    </> : null}

    {tab === "customers" ? <>
      <div className="button-row workbench-actions">{editable ? <><Link className="button" href={`${base}/customers/new`}>{industry.businessLabels.customer}を追加</Link><Link className="button secondary" href={`${base}/customers/import`}>CSV・Excelで一括取込</Link></> : null}<Link className="button secondary" href={`${base}/archives`}>削除済み・復元</Link><Link className="button secondary" href={`${base}/customer-segments`}>詳しい分類</Link></div>
      <form className="workbench-search" method="get"><input name="tab" type="hidden" value="customers"/>{["group", "recency", "segment"].map(key => query[key as keyof Query] ? <input type="hidden" name={key} key={key} value={query[key as keyof Query]}/> : null)}<label htmlFor="q">お客様を検索</label><input id="q" name="q" defaultValue={query.q ?? ""} placeholder="名前・電話・担当・タグ"/><button className="button secondary">検索</button><Link href={`${base}/customers?tab=customers`}>絞り込みを解除</Link></form>
      <p className="muted">{customers.length}件を表示{query.group || query.recency || query.segment ? "（分析・分類の絞り込み中）" : ""}</p>
      {customerState === "unregistered" ? <DataPreview kind="cards" title="お客様の情報を、探さず確認できるように" description="顧客名簿のCSV・Excelを取り込むと、連絡先・担当・利用履歴をまとめて表示できます。不明な情報は後から追加できます。" importHref={editable ? `${base}/customers/import` : undefined} manualHref={editable ? `${base}/customers/new` : undefined} /> : null}
      {customerState === "archived" ? <p className="notice">顧客はすべて削除済みです。「削除済み・復元」を確認してください。</p> : customerState === "filtered-empty" ? <p className="notice">条件に合うお客様がいません。絞り込みを解除して確認できます。</p> : null}
      <div className="customer-card-list">{customers.map(customer => <article key={customer.id} className="card customer-summary-card"><div><Link href={`${base}/customers/${customer.id}`}><h2>{customer.name}</h2></Link><p>{customer.phone || customer.email || "連絡先未登録"}</p><span className="badge">{customer.do_not_contact ? "配信停止" : customer.line_opt_in || customer.email_opt_in ? "配信同意あり" : "配信同意未確認"}</span></div><dl><div><dt>最終{labels.visit}</dt><dd>{customer.last_visit_date ?? "未登録"}</dd></div><div><dt>{labels.visit}回数</dt><dd>{customer.visit_count ? `${customer.visit_count}回` : "履歴未登録"}</dd></div><div><dt>担当</dt><dd>{customer.assigned_staff_name || "未設定"}</dd></div></dl><div className="button-row"><Link className="button secondary" href={`${base}/customers/${customer.id}`}>詳細・メモ</Link>{editable ? <form action={archiveStoreEntityAction.bind(null, store.id, "customer", customer.id, `${base}/customers?tab=customers`)}><ConfirmSubmitButton message={`「${customer.name}」を削除します。過去の書類との関連は保持されます。`}>削除</ConfirmSubmitButton></form> : null}</div></article>)}</div>
    </> : null}

    {tab === "analysis" ? <section className="visual-section">
      <div className="section-heading"><h2>お客様の傾向と次のフォロー</h2>{editable ? <Link className="button" href={`${base}/customer-messages`}>案内文の下書きを作る</Link> : null}</div>
      {workspace.total === 0 ? <DataPreview title="履歴を取り込むと、お客様の傾向が見えてきます" description="顧客名簿に利用回数・最終利用日があれば、初回・再利用の割合や、最近利用のないお客様を確認できます。" importHref={editable ? `${base}/customers/import` : undefined} manualHref={editable ? `${base}/customers/new` : undefined}/> : allCustomers.length === 0 ? <p className="notice">分析対象の顧客はすべて削除済みです。削除済みデータを確認してください。</p> : <>
        <div className="visual-grid cols-2"><DonutChart title={labels.visit === "来店" ? "来店状況" : `${labels.visit}状況`} centerLabel="登録顧客" centerValue={`${allCustomers.length}人`} data={visitGroups.map(([key, label]) => ({ label, value: allCustomers.filter(c => visitGroup(c.visit_count) === key).length }))} emptyMessage="履歴未登録です。"/><HorizontalBarChart title={`最終${labels.visit}からの経過`} data={recencyGroups.map(([key, label]) => ({ label, value: allCustomers.filter(c => recencyGroup(c.last_visit_date) === key).length }))} emptyMessage="最終利用日が未登録です。"/></div>
        <nav className="button-row workbench-actions" aria-label="分析から顧客を絞り込む">{visitGroups.map(([key, label]) => <Link className="button secondary" href={`${base}/customers?tab=customers&group=${key}`} key={key}>{label}のお客様</Link>)}<Link className="button secondary" href={`${base}/customers?tab=customers&recency=long`}>90日以上のお客様</Link><Link className="button secondary" href={`${base}/customers?tab=customers&recency=unknown`}>最終利用日を確認する</Link></nav>
        <details className="card"><summary>連絡可否・担当者別を見る</summary><div className="visual-grid cols-2"><DonutChart title="連絡可否" centerLabel="同意確認済み" centerValue={`${contactable}人`} data={[{ label: "同意確認済み", value: contactable }, { label: "未確認・停止", value: allCustomers.length - contactable }]} emptyMessage="未登録"/><HorizontalBarChart title="担当者別の顧客数" data={Array.from(allCustomers.reduce((m, c) => { const k = c.assigned_staff_name || "担当未設定"; m.set(k, (m.get(k) ?? 0) + 1); return m; }, new Map<string, number>()), ([label, value]) => ({ label, value }))} emptyMessage="担当未登録"/></div></details>
      </>}
      <p className="notice">登録済みの利用回数・最終利用日から集計しています。再来周期や来店予定の予測ではありません。案内文は未送信の下書きです。外部送信は行いません。</p>
    </section> : null}
  </AppShell>;
}
