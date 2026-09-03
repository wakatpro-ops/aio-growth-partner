type SaleGroupRow = {
  id: string;
  normalized_data: Record<string, string | number | boolean | null>;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function businessDate(value: unknown) {
  const input = text(value);
  if (!input) return "unknown-date";
  return input.replace(/[年月]/gu, "-").replace(/日/gu, "").replace(/[./]/gu, "-").slice(0, 10);
}

export function unifiedSaleGroupKey(row: SaleGroupRow) {
  const transactionId = text(row.normalized_data.transaction_id);
  return transactionId ? `${businessDate(row.normalized_data.date)}:${transactionId}` : `row:${row.id}`;
}

export function groupUnifiedSaleRows<T extends SaleGroupRow>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = unifiedSaleGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}
