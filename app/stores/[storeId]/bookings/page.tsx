import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { BookingList } from "@/components/bookings/booking-list";
import { PageHeader } from "@/components/ui/page-header";
import { listBookings, type BookingListView } from "@/lib/bookings";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";
import { canEditStore } from "@/lib/auth/server";

const views: Array<[BookingListView, string]> = [["today", "今日"], ["upcoming", "今後"], ["past", "過去"], ["deleted", "削除済み"]];

export default async function BookingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ view?: string; saved?: string; deleted?: string; error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const editable = await canEditStore(store.id, store.organization_id);
  const industry = getIndustryConfig(store.industry_type_key);
  const view = views.some(([key]) => key === query.view) ? query.view as BookingListView : "today";
  const [bookings, today, upcoming, deleted] = await Promise.all([
    listBookings(store.id, view), listBookings(store.id, "today"), listBookings(store.id, "upcoming"), listBookings(store.id, "deleted")
  ]);
  const activeToday = today.filter((booking) => !["cancelled", "no_show"].includes(booking.status)).length;
  const confirmedUpcoming = upcoming.filter((booking) => booking.status === "confirmed").length;

  return <AppShell>
    <PageHeader eyebrow={industry.name} title="予約" description="電話・店頭・LINE・AIO boostで受け付けた予約を、一つの台帳で管理します。" action={editable ? <div className="button-row"><Link className="button" href={`/stores/${store.id}/bookings/new`}>予約を登録</Link><Link className="button secondary" href={`/stores/${store.id}/bookings/settings`}>予約内容・担当・設備</Link><Link className="button secondary" href={`/stores/${store.id}/bookings/line`}>LINE予約</Link><Link className="button secondary" href={`/stores/${store.id}/bookings/migration`}>既存LINE予約から移行</Link><Link className="button secondary" href={`/stores/${store.id}/bookings/integrations`}>外部予約サービス</Link></div> : <span className="badge">閲覧のみ</span>} />
    {query.saved ? <p className="notice success">予約を保存しました。</p> : null}
    {query.deleted ? <p className="notice success">予約を削除しました。削除済みから元に戻せます。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
    <section className="grid cols-3 booking-metrics">
      <article className="card"><p className="muted">今日の予約</p><div className="metric">{activeToday}件</div><p>キャンセル・無断キャンセルを除く件数</p></article>
      <article className="card"><p className="muted">今後の確定予約</p><div className="metric">{confirmedUpcoming}件</div><p>明日以降で確定している予約</p></article>
      <article className="card"><p className="muted">削除済み</p><div className="metric">{deleted.length}件</div><p>必要な予約は元に戻せます</p></article>
    </section>
    <section className="card booking-ledger">
      <div className="section-heading"><div><p className="eyebrow">予約台帳</p><h2>{views.find(([key]) => key === view)?.[1]}の予約</h2></div><span className="badge">{bookings.length}件</span></div>
      <nav className="booking-tabs" aria-label="予約期間">
        {views.map(([key, label]) => <Link aria-current={view === key ? "page" : undefined} className={view === key ? "active" : ""} href={`/stores/${store.id}/bookings?view=${key}`} key={key}>{label}</Link>)}
      </nav>
      <BookingList storeId={store.id} bookings={bookings} deleted={view === "deleted"} />
    </section>
    <p className="notice">外部予約サイトは、公式API・提供会社の許諾・店舗ごとの接続テストを確認した媒体だけ読み取り専用で開放します。外部への書き戻しは行いません。</p>
  </AppShell>;
}
