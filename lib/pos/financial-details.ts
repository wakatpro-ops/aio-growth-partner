/** NULL is unknown, not zero, including in a partly known aggregate. */
export function addKnownFinancialAmount(current: unknown, next: unknown): number | null {
  if (current === null || next === null) return null;
  const left = Number(current ?? 0), right = Number(next ?? 0);
  if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error("invalid_financial_amount");
  return left + right;
}
export function financialDetailsUnconfirmed(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === "object" && "financial_details_status" in metadata && metadata.financial_details_status === "unconfirmed");
}
export class SalesFinancialDetailsError extends Error {
  constructor(public readonly code: "unconfirmed" | "unavailable") {
    super(code === "unconfirmed"
      ? "税額・税抜金額の確認待ちの売上があるため、会計ソフト用データは出力できません。税込売上の確認は引き続き利用できます。"
      : "売上の税額確認状況を取得できないため、会計ソフト用の出力を中止しました。時間をおいてお試しください。");
  }
}
export function requireKnownSalesTax(rows: Array<{ tax_amount?: unknown; net_amount?: unknown; source_metadata?: unknown }>) {
  if (rows.some(row => row.tax_amount === null || row.net_amount === null || financialDetailsUnconfirmed(row.source_metadata))) {
    throw new SalesFinancialDetailsError("unconfirmed");
  }
}
