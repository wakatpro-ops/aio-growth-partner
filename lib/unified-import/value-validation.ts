import { normalizeImportBusinessDate, parseImportDateIso } from "../import-date.ts";
import type { UnifiedImportRecordType } from "@/types/unified-import";

export type ImportValueIssue = { field: string; message: string };

function text(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim();
}

/** Invalid non-empty values always return null, never the optional blank default. */
export function parseImportNumber(value: unknown, options: { blankValue?: number | null } = {}): number | null {
  if (value !== null && value !== undefined && typeof value !== "string" && typeof value !== "number") return null;
  let input = text(value).replace(/−/gu, "-");
  if (!input) {
    const blank = options.blankValue ?? null;
    return blank !== null && Number.isFinite(blank) && Math.abs(blank) <= Number.MAX_SAFE_INTEGER ? blank : null;
  }
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;

  input = input.replace(/\s*(?:円|JPY)$/iu, "").trimEnd();
  let accountingNegative = input.startsWith("(") && input.endsWith(")");
  if (accountingNegative) input = input.slice(1, -1).trim();
  let sign = accountingNegative ? -1 : 1;
  let signSeen = false;
  let currencySeen = false;
  // Currency and sign may appear as either -¥1,000 or ¥-1,000.
  for (let index = 0; index < 2; index += 1) {
    const signMatch = input.match(/^[+\-△▲]/u);
    const currencyMatch = input.match(/^(?:¥|JPY)\s*/iu);
    if (signMatch && !signSeen && !accountingNegative) {
      sign = signMatch[0] === "+" ? 1 : -1;
      signSeen = true;
      input = input.slice(signMatch[0].length).trimStart();
    } else if (currencyMatch && !currencySeen) {
      currencySeen = true;
      input = input.slice(currencyMatch[0].length).trimStart();
    } else break;
  }
  input = input.replace(/\s*(?:円|JPY)$/iu, "").trimEnd();
  if (input.startsWith("(") && input.endsWith(")")) {
    if (accountingNegative || signSeen) return null;
    accountingNegative = true;
    sign = -1;
    input = input.slice(1, -1).trim();
  }
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/u.test(input)) return null;
  const parsed = Number(input.replace(/,/gu, "")) * sign;
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) return null;
  return Object.is(parsed, -0) ? 0 : parsed;
}

/** Sales quantities default to one only when genuinely blank; explicit zero stays zero. */
export function parseImportQuantity(value: unknown): number | null {
  return parseImportNumber(value, { blankValue: 1 });
}

const numberFields: Partial<Record<UnifiedImportRecordType, string[]>> = {
  sale: ["amount", "unit_price", "tax_amount"],
  expense: ["amount", "subtotal_amount", "tax_amount"],
  customer: ["visit_count"],
  item: ["unit_price", "cost_price", "tax_rate"],
  inventory: ["quantity", "reorder_point"]
};

const labels: Record<string, string> = {
  date: "日付", time: "時刻", amount: "金額", unit_price: "単価", tax_amount: "税額", subtotal_amount: "税抜金額",
  quantity: "数量", cost_price: "原価", tax_rate: "税率", reorder_point: "発注点", visit_count: "来店回数",
  birth_date: "生年月日", last_visit_date: "最終来店日"
};

/** Validate supplied values. Missing required fields are handled by the mapping/presence checks. */
export function validateUnifiedImportValues(kind: UnifiedImportRecordType, data: Record<string, unknown>): ImportValueIssue[] {
  if (kind === "unknown" || kind === "ignore") return [];
  const issues: ImportValueIssue[] = [];
  const dates = kind === "sale" || kind === "expense" ? ["date"] : kind === "customer" ? ["birth_date", "last_visit_date"] : [];
  for (const field of dates) {
    if (!text(data[field])) continue;
    if (!normalizeImportBusinessDate(data[field]) || !parseImportDateIso(data[field])) {
      issues.push({ field, message: `${labels[field]}は年を含む実在する日付で入力してください（例: 2026-09-01）。` });
    } else if (field === "date" && kind === "sale" && text(data.time) && !parseImportDateIso(data.date, data.time)) {
      issues.push({ field: "time", message: "時刻を確認してください（例: 09:30）。日付欄に時刻がある場合は、時刻欄を空にしてください。" });
    }
  }
  for (const field of numberFields[kind] ?? []) {
    if (!text(data[field])) continue;
    const parsed = parseImportNumber(data[field]);
    if (parsed === null) issues.push({ field, message: `${labels[field]}を数値として読み取れません。元ファイルの値・数式を確認してください。` });
    else if ((field === "visit_count" && (!Number.isInteger(parsed) || parsed < 0)) || (["reorder_point", "tax_rate"].includes(field) && parsed < 0)) {
      issues.push({ field, message: `${labels[field]}は0以上${field === "visit_count" ? "の整数" : "の数値"}で入力してください。` });
    }
  }
  if (kind === "sale") {
    const quantity = parseImportQuantity(data.quantity);
    if (quantity === null || quantity <= 0) issues.push({ field: "quantity", message: "数量は0より大きい数値で入力してください。空欄は1として取り込みます。" });
  }
  return issues;
}
