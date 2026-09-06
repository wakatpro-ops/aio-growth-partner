import Link from "next/link";
import { bookingResourceTypeLabels, bookingSourceLabels, bookingStatusLabels } from "@/lib/bookings/constants";
import type { StoreBooking } from "@/types/bookings";

const dateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const time = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

export function BookingList({ storeId, bookings, deleted = false }: { storeId: string; bookings: StoreBooking[]; deleted?: boolean }) {
  if (bookings.length === 0) {
    return <div className="booking-empty"><strong>{deleted ? "削除済み予約はありません" : "この期間の予約はありません"}</strong><p>{deleted ? "削除した予約はここから元に戻せます。" : "新しい予約を登録すると、時間順に表示されます。"}</p></div>;
  }
  return <div className="booking-list">
    {bookings.map((booking) => {
      const resources = (booking.allocations ?? []).map((allocation) => allocation.resource).filter(Boolean);
      return <Link className={`booking-row status-${booking.status}`} href={`/stores/${storeId}/bookings/${booking.id}${deleted ? "?deleted=1" : ""}`} key={booking.id}>
        <div className="booking-row-time"><strong>{dateTime.format(new Date(booking.starts_at))}</strong><span>〜 {time.format(new Date(booking.ends_at))}</span></div>
        <div className="booking-row-main"><strong>{booking.customer_name}</strong><span>{booking.service?.name ?? booking.service_name ?? "内容未設定"}</span><small>{resources.length ? resources.map((resource) => `${resource?.name}（${resource ? bookingResourceTypeLabels[resource.resource_type] : ""}）`).join("・") : "担当・設備未設定"}</small></div>
        <div className="booking-row-meta"><span className={`badge booking-status-${booking.status}`}>{deleted ? "削除済み" : bookingStatusLabels[booking.status]}</span><small>{bookingSourceLabels[booking.source]}</small></div>
      </Link>;
    })}
  </div>;
}
