import { calendarDays, japanDay, shiftDay, validDay } from "../customer-workbench-rules";

export type AiArea = "home" | "bookings" | "customers" | "sales" | "inventory" | "reviews" | "aio" | "marketing" | "inbox" | "documents" | "imports" | "settings" | "help";
export type AiPage = { area: AiArea; pathname: string; key: string; tab: string; view: string; day: string; days: string[]; recordId: string | null; query: Record<string, string> };
export type AiSection = { key: string; label: string; state: "ready" | "empty" | "unavailable" | "restricted"; summary: string; data?: unknown; truncated?: boolean };
export type AiLink = { label: string; href: string };
export type AiContext = { version: string; key: string; pageLabel: string; storeName: string; industry: string; role: string; canEdit: boolean; manager: boolean; observedAt: string; day: string; greeting: string; suggestions: string[]; links: AiLink[]; guidance: string; sections: AiSection[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedQuery = ["tab", "view", "date", "q", "segment", "group", "recency", "days", "month", "from", "to"];

export function resolveAiPage(storeId: string, pathname: string, search = "", now = new Date()): AiPage {
  const base = `/stores/${storeId}`;
  if (!uuid.test(storeId) || (pathname !== base && !pathname.startsWith(`${base}/`)) || /[?#\\]|%|\/\.\.(?:\/|$)/u.test(pathname)) throw new Error("invalid_page");
  const suffix = pathname.slice(base.length), parts = suffix.split("/").filter(Boolean);
  const query = Object.fromEntries([...new URLSearchParams(search)].filter(([key]) => allowedQuery.includes(key)).map(([key, value]) => [key, value.slice(0, 160)]));
  let area: AiArea = "help";
  if (!suffix || suffix === "/") area = "home";
  else if (/^\/customers(?:\/|$)/u.test(suffix)) area = query.tab === "analysis" || query.tab === "customers" || query.q || query.segment || query.group || query.recency || parts.length > 1 ? "customers" : "bookings";
  else if (/^\/bookings\/(integrations|settings|services|resources|line|migration)(?:\/|$)/u.test(suffix)) area = "settings";
  else if (/^\/bookings(?:\/|$)/u.test(suffix)) area = "bookings";
  else if (/^\/customer-(segments|messages)/u.test(suffix)) area = "customers";
  else if (/^\/(sales|sales-hub)(?:\/|$)/u.test(suffix)) area = "sales";
  else if (/^\/(inventory|items)(?:\/|$)/u.test(suffix)) area = "inventory";
  else if (/^\/reviews(?:\/|$)/u.test(suffix)) area = "reviews";
  else if (/^\/(aio-improvement|results)(?:\/|$)/u.test(suffix)) area = "aio";
  else if (/^\/(marketing|growth-actions|growth-calendar|posts)(?:\/|$)/u.test(suffix)) area = "marketing";
  else if (/^\/ai-inbox(?:\/|$)/u.test(suffix)) area = "inbox";
  else if (/^\/(estimates|invoices|payments)(?:\/|$)/u.test(suffix)) area = "documents";
  else if (/^\/data-imports(?:\/|$)/u.test(suffix)) area = "imports";
  else if (/^\/settings(?:\/|$)/u.test(suffix)) area = "settings";
  const day = validDay(query.date, japanDay(now));
  const view = ["day", "week", "upcoming", "past", "deleted"].includes(query.view) ? query.view : "week";
  const tab = query.tab || (area === "bookings" ? "bookings" : area === "inventory" ? "menu" : "");
  return { area, pathname, key: `${pathname}?${new URLSearchParams(Object.entries(query).sort())}`, tab, view, day, days: calendarDays(day, view === "week"), recordId: parts.find(part => uuid.test(part)) ?? null, query };
}

export function bookingPeriod(page: AiPage) {
  return { start: `${page.days[0]}T00:00:00+09:00`, end: `${shiftDay(page.days.at(-1)!, 1)}T00:00:00+09:00` };
}

export function bookingFacts<T extends { status: string; archived_at?: string | null }>(rows: T[], includeArchived = false) {
  const bookings = rows.filter(row => includeArchived || !row.archived_at);
  return { bookings, totalCount: bookings.length,
    excludingCancelledAndNoShowCount: bookings.filter(row => !["cancelled", "no_show"].includes(row.status)).length,
    pendingCount: bookings.filter(row => row.status === "pending").length };
}

export function salesFacts(rows: Array<{ business_date: string; gross_amount: number | string }>) {
  const months = new Map<string, { month: string; amount: number; count: number }>();
  for (const row of rows) {
    const month = row.business_date.slice(0, 7), amount = Number(row.gross_amount);
    if (!Number.isFinite(amount)) throw new Error("invalid_amount");
    const current = months.get(month) ?? { month, amount: 0, count: 0 };
    current.amount += amount; current.count++; months.set(month, current);
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const total = monthly.reduce((sum, row) => sum + row.amount, 0);
  return { total, count: rows.length, average: rows.length ? Math.round(total / rows.length) : null, monthly, latest: monthly.at(-1) ?? null };
}

export function contextGreeting(label: string, sections: AiSection[]) {
  const ready = sections.filter(section => section.state === "ready" || section.state === "empty");
  const failed = sections.some(section => section.state === "unavailable");
  if (!ready.length && sections.some(section => section.state === "restricted")) return sections.filter(section => section.state === "restricted").map(section => section.summary).join(" ");
  if (!ready.length) return failed ? `${label}のデータを取得できませんでした。再確認するか、操作方法をご相談ください。` : `${label}を開いています。使い方や次に進めることを一緒に確認しましょう。`;
  return ready.slice(0, 2).map(section => section.summary).join(" ") + (failed ? " 一部の情報は取得できていません。" : " 気になるところから一緒に確認しましょう。");
}

export function publicContext(context: AiContext) {
  // The rail only needs summaries, not customer rows. Chat context stays server-side.
  return { key: context.key, pageLabel: context.pageLabel, observedAt: context.observedAt, greeting: context.greeting, suggestions: context.suggestions, links: context.links, sections: context.sections.map(({ key, label, state }) => ({ key, label, state })) };
}
export type AiContextCard = ReturnType<typeof publicContext>;
