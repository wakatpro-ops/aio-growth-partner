import { normalizeImportBusinessDate } from "../import-date.ts";

type SaleGroupRow = {
  id: string;
  sheet_name?: string;
  normalized_data: Record<string, string | number | boolean | null>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function businessDate(value: unknown) {
  return normalizeImportBusinessDate(value) ?? "unknown-date";
}

export function unifiedSaleGroupKey(row: SaleGroupRow) {
  const transactionId = text(row.normalized_data.transaction_id);
  // A receipt number is local to its source table. A held table must not
  // collide with another table's already-imported receipt when resumed.
  return JSON.stringify(transactionId
    ? ["receipt", row.sheet_name ?? "", businessDate(row.normalized_data.date), transactionId]
    : ["row", row.sheet_name ?? "", row.id]);
}

export function groupUnifiedSaleRows<T extends SaleGroupRow>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = unifiedSaleGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}
