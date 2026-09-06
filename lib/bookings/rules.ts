import type { BookingStatus } from "@/types/bookings";

export type BookingInterval = {
  startsAt: string | Date;
  endsAt: string | Date;
  status?: BookingStatus;
  archived?: boolean;
};

export function intervalsOverlap(left: BookingInterval, right: BookingInterval) {
  if (left.archived || right.archived) return false;
  if (left.status && !["pending", "confirmed"].includes(left.status)) return false;
  if (right.status && !["pending", "confirmed"].includes(right.status)) return false;
  const leftStart = new Date(left.startsAt).getTime();
  const leftEnd = new Date(left.endsAt).getTime();
  const rightStart = new Date(right.startsAt).getTime();
  const rightEnd = new Date(right.endsAt).getTime();
  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) return false;
  return leftStart < rightEnd && leftEnd > rightStart;
}
export function bookingDurationMinutes(startsAt: string | Date, endsAt: string | Date) {
  return Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000));
}

export function parseJapanDateTimeLocal(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(normalized)) {
    throw new Error("予約日時を入力してください。");
  }
  const parsed = new Date(`${normalized}:00+09:00`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("予約日時を入力してください。");
  return parsed.toISOString();
}

export function toJapanDateTimeLocal(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
