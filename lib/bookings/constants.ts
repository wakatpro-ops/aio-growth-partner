import type { BookingResourceType, BookingSource, BookingStatus } from "@/types/bookings";

export const bookingStatusLabels: Record<BookingStatus, string> = {
  pending: "申込",
  confirmed: "確定",
  completed: "完了",
  cancelled: "キャンセル",
  no_show: "無断キャンセル"
};
export const bookingSourceLabels: Record<BookingSource, string> = {
  aio_boost: "AIO boost",
  manual: "手入力",
  phone: "電話",
  line: "LINE",
  external: "外部予約サイト"
};

export const bookingResourceTypeLabels: Record<BookingResourceType, string> = {
  staff: "スタッフ",
  seat: "席",
  room: "部屋",
  equipment: "設備",
  table: "テーブル",
  vehicle: "車両",
  other: "その他"
};
