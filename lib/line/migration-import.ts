import { parseImportDateIso } from "../import-date.ts";
import type { ParsedSalesRow } from "@/types/phase4";
import type { LineMigrationImportPayload } from "@/types/line-migration";

export type AnalyzedLineMigrationRow = {
  rowNumber: number;
  status: "preview" | "invalid";
  data: LineMigrationImportPayload;
  error: string | null;
};

const aliases = {
  dateTime: ["予約日時", "開始日時", "来店日時", "startdatetime", "datetime"],
  date: ["予約日", "来店日", "開始日", "日付", "date", "startdate"],
  time: ["予約時間", "開始時間", "来店時間", "時刻", "時間", "time", "starttime"],
  endTime: ["終了時間", "終了時刻", "endtime"],
  duration: ["所要時間", "利用時間", "施術時間", "duration", "minutes"],
  customer: ["顧客名", "お客様名", "予約者名", "氏名", "customername", "customer"],
  phone: ["電話番号", "携帯番号", "tel", "phone"],
  email: ["メールアドレス", "メール", "email", "mail"],
  service: ["予約内容", "メニュー名", "サービス名", "コース名", "menu", "service", "course"],
  staff: ["担当者", "スタッフ名", "担当スタッフ", "staff"],
  notes: ["備考", "メモ", "要望", "note", "memo"]
} as const;

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s_・\-()（）／/]/gu, "");
}

function findHeader(headers: string[], candidates: readonly string[]) {
  const normalizedCandidates = candidates.map(normalize);
  return headers.find((header) => normalizedCandidates.some((candidate) => normalize(header).includes(candidate))) ?? null;
}

function value(row: ParsedSalesRow, header: string | null) {
  return header ? String(row[header] ?? "").trim() : "";
}

function splitDateTime(input: string) {
  const normalized = input.trim().replace(/[年月]/gu, "-").replace(/日/gu, "").replace(/[./]/gu, "-");
  const match = normalized.match(/^(\d{4}-\d{1,2}-\d{1,2})[T\s]+(\d{1,2}:\d{2})(?::\d{2})?/u);
  return match ? { date: match[1], time: match[2] } : null;
}

function parseStart(row: ParsedSalesRow, headers: Record<keyof typeof aliases, string | null>) {
  const combined = value(row, headers.dateTime);
  if (combined) {
    const parts = splitDateTime(combined);
    if (parts) return parseImportDateIso(parts.date, parts.time);
  }
  return parseImportDateIso(value(row, headers.date), value(row, headers.time));
}

function durationMinutes(row: ParsedSalesRow, header: string | null) {
  const raw = value(row, header).replace(/[^0-9.]/gu, "");
  const parsed = Number(raw || 60);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1440 ? Math.round(parsed) : 60;
}

function endAt(startAt: string, row: ParsedSalesRow, headers: Record<keyof typeof aliases, string | null>) {
  const end = value(row, headers.endTime);
  if (end) {
    const japanDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(startAt));
    const parsed = parseImportDateIso(japanDate, end);
    if (parsed && new Date(parsed) > new Date(startAt)) return parsed;
  }
  return new Date(new Date(startAt).getTime() + durationMinutes(row, headers.duration) * 60_000).toISOString();
}

export function analyzeLineMigrationRows(rows: ParsedSalesRow[], now = new Date()) {
  if (rows.length > 5000) throw new Error("一度に確認できる予約は5,000件までです。ファイルを分割してください。");
  const sourceHeaders = Object.keys(rows[0] ?? {});
  const headers = Object.fromEntries(Object.entries(aliases).map(([key, candidates]) => [key, findHeader(sourceHeaders, candidates)])) as Record<keyof typeof aliases, string | null>;
  const recognized = Object.values(headers).filter(Boolean).length;
  if (!headers.dateTime && (!headers.date || !headers.time)) throw new Error("予約日と開始時間の列を確認できませんでした。見出し名を分かりやすくしてください。");
  if (!headers.customer) throw new Error("お客様名の列を確認できませんでした。");

  const analyzed = rows.map((row, index): AnalyzedLineMigrationRow => {
    const customerName = value(row, headers.customer);
    const startsAt = parseStart(row, headers);
    const errors: string[] = [];
    if (!customerName) errors.push("お客様名がありません");
    if (!startsAt) errors.push("予約日時を読み取れません");
    else if (new Date(startsAt) <= now) errors.push("過去の予約は対象外です");
    const customerEmail = value(row, headers.email).toLowerCase();
    if (customerEmail && !/^\S+@\S+\.\S+$/u.test(customerEmail)) errors.push("メールアドレスを確認できません");
    const safeStart = startsAt ?? now.toISOString();
    const data: LineMigrationImportPayload = {
      customerName,
      customerPhone: value(row, headers.phone),
      customerEmail,
      serviceName: value(row, headers.service) || "予約内容未確認",
      staffName: value(row, headers.staff),
      startsAt: safeStart,
      endsAt: endAt(safeStart, row, headers),
      notes: value(row, headers.notes)
    };
    return { rowNumber: index + 2, status: errors.length ? "invalid" : "preview", data, error: errors.join("、") || null };
  });

  return { headers, recognizedColumns: recognized, rows: analyzed, validRows: analyzed.filter((row) => row.status === "preview").length };
}
