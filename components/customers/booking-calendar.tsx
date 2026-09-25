import Link from "next/link";
import { BookingList } from "@/components/bookings/booking-list";
import { bookingStatusLabels } from "@/lib/bookings/constants";
import { overlapsDay, japanDay } from "@/lib/customer-workbench-rules";
import type { StoreBooking } from "@/types/bookings";

const time = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const date = (day: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${day}T12:00:00+09:00`));

export function BookingCalendar({ storeId, days, bookings }: { storeId: string; days: string[]; bookings: StoreBooking[] }) {
  return <>
    <p className="muted">日本時間・開始時刻順。空白は予約可能枠を意味しません。重なる予約・日をまたぐ予約も表示します。</p>
    <div className={`customer-calendar ${days.length === 1 ? "single" : ""}`} aria-label="予約カレンダー">
      {days.map(day => <section className="customer-calendar-day" key={day}><h3>{date(day)}</h3>
        {bookings.filter(booking => overlapsDay(booking.starts_at, booking.ends_at, day)).map(booking => <Link className={`calendar-booking status-${booking.status}`} href={`/stores/${storeId}/bookings/${booking.id}`} key={booking.id}>
          <strong>{japanDay(booking.starts_at) < day ? "前日から" : time(booking.starts_at)} 〜 {japanDay(booking.ends_at) > day ? "翌日へ" : time(booking.ends_at)}</strong>
          <span>{booking.customer_name}</span><small>{booking.service?.name ?? booking.service_name ?? "内容未設定"}</small>
          <small>{(booking.allocations ?? []).map(a => a.resource?.name).filter(Boolean).join("・") || "担当未設定"}</small>
          <span className="badge">{bookingStatusLabels[booking.status]}</span>
        </Link>)}
        {!bookings.some(booking => overlapsDay(booking.starts_at, booking.ends_at, day)) ? <p className="muted">予約なし</p> : null}
      </section>)}
    </div>
    <div className="customer-calendar-mobile"><BookingList storeId={storeId} bookings={bookings} /></div>
  </>;
}
