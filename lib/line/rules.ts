const japanFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function parseLineDateTime(value: string, now = new Date()) {
  const normalized = value.trim().replace(/[年月]/gu, "/").replace(/日/gu, " ").replace(/[時：]/gu, ":").replace(/分/gu, "");
  const match = normalized.match(/(?:(\d{4})[\/-])?(\d{1,2})[\/-](\d{1,2})\s+(\d{1,2}):(\d{2})/u);
  if (!match) return null;
  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  let year = yearValue ? Number(yearValue) : Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric" }).format(now));
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  let candidate = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
  if (!yearValue && candidate.getTime() < now.getTime() - 24 * 60 * 60_000) {
    year += 1;
    candidate = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
  }
  return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
}

export function lineSlotCandidates(requested: string, count = 3) {
  const start = new Date(requested);
  if (!Number.isFinite(start.getTime())) return [];
  return Array.from({ length: count }, (_, index) => new Date(start.getTime() + index * 30 * 60_000).toISOString());
}

export function formatLineDateTime(value: string | Date) {
  return japanFormatter.format(new Date(value));
}

export function numericChoice(value: string, max: number) {
  const normalized = value.trim().replace(/[①➀]/gu, "1").replace(/[②➁]/gu, "2").replace(/[③➂]/gu, "3").replace(/[④➃]/gu, "4").replace(/[⑤➄]/gu, "5").replace(/[⑥➅]/gu, "6").replace(/[⑦➆]/gu, "7").replace(/[⑧➇]/gu, "8").replace(/[⑨➈]/gu, "9");
  const match = normalized.match(/^([1-9]\d*)/u);
  const choice = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(choice) && choice >= 1 && choice <= max ? choice - 1 : null;
}

export function isAffirmative(value: string) {
  return /^(?:1|①|はい|同意|申込|申し込む|確定|ok)$/iu.test(value.trim());
}

export function isNegative(value: string) {
  return /^(?:2|②|いいえ|中止|やめる|キャンセルしない)$/iu.test(value.trim());
}

