export function japanDay(value: Date | string = new Date()): string {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function validDay(value: string | undefined, fallback = japanDay()): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isFinite(date.getTime()) && japanDay(date) === value ? value : fallback;
}

export function shiftDay(day: string, delta: number): string {
  return japanDay(new Date(new Date(`${day}T00:00:00+09:00`).getTime() + delta * 86400000));
}

export function calendarDays(day: string, weekly: boolean): string[] {
  const weekday = new Date(`${day}T00:00:00+09:00`).getUTCDay();
  // UTC is the preceding day at Japanese midnight. Sunday UTC means Monday JST.
  const start = weekly ? shiftDay(day, -weekday) : day;
  return Array.from({ length: weekly ? 7 : 1 }, (_, i) => shiftDay(start, i));
}

export function overlapsDay(start: string, end: string, day: string): boolean {
  return new Date(start).getTime() < new Date(`${shiftDay(day, 1)}T00:00:00+09:00`).getTime()
    && new Date(end).getTime() > new Date(`${day}T00:00:00+09:00`).getTime();
}

export type EmptyDataState = "error" | "unregistered" | "archived" | "filtered-empty" | "ready";
export function dataState(total: number | null, active: number, visible: number): EmptyDataState {
  if (total === null) return "error";
  if (total === 0) return "unregistered";
  if (active === 0) return "archived";
  return visible === 0 ? "filtered-empty" : "ready";
}

export function visitGroup(count: number | null | undefined): "first" | "repeat" | "unknown" {
  return count === 1 ? "first" : typeof count === "number" && count >= 2 ? "repeat" : "unknown";
}

export function recencyGroup(lastDate: string | null | undefined, today = japanDay()): "recent" | "middle" | "long" | "unknown" {
  if (!lastDate || validDay(lastDate, "") !== lastDate) return "unknown";
  const days = (Date.parse(`${today}T00:00:00+09:00`) - Date.parse(`${lastDate}T00:00:00+09:00`)) / 86400000;
  if (days < 0) return "unknown";
  return days < 30 ? "recent" : days < 90 ? "middle" : "long";
}

export function customerWorkLabels(industry: string) {
  if (industry === "auto_repair") return { visit: "入庫", memo: "車両・整備の申し送り" };
  if (industry === "restaurant") return { visit: "来店", memo: "席・食事のご希望" };
  if (["beauty_salon", "salon"].includes(industry)) return { visit: "来店", memo: "施術・接客の申し送り" };
  return { visit: "利用", memo: "ご希望・対応の申し送り" };
}
