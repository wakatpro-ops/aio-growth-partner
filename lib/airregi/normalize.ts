import { createHash } from "node:crypto";
import { pageSchema, type AirRegiTransaction } from "./contracts";

export function validateAirRegiPage(input: unknown, externalStoreId: string, previousCursor: string | null, previousWatermark: string | null) {
  if (Buffer.byteLength(JSON.stringify(input) ?? "", "utf8") > 2 * 1024 * 1024) throw new Error("invalid_provider_data");
  const result = pageSchema.safeParse(input);
  if (!result.success) throw new Error("invalid_provider_data");
  const page = result.data;
  if (page.externalStoreId !== externalStoreId) throw new Error("store_mismatch");
  if (page.nextCursor !== null && page.nextCursor === previousCursor) throw new Error("cursor_did_not_advance");
  if (previousWatermark && (!page.watermark || Date.parse(page.watermark) < Date.parse(previousWatermark))) throw new Error("watermark_regressed");
  if (page.nextCursor && (page.watermark === null ? previousWatermark !== null : previousWatermark === null || Date.parse(page.watermark) !== Date.parse(previousWatermark))) throw new Error("watermark_before_last_page");
  const ids = new Set<string>();
  for (const transaction of page.transactions) {
    if (ids.has(transaction.sourceId)) throw new Error("duplicate_source_id");
    ids.add(transaction.sourceId);
  }
  return page;
}
export function transactionFingerprint(transaction: AirRegiTransaction) {
  // Fixed field ordering, stable item order supplied by the verified adapter.
  return createHash("sha256").update(JSON.stringify(transaction)).digest("hex");
}
export function projectAirRegiTransaction(transaction: AirRegiTransaction) {
  const sign = transaction.kind === "refund" ? -1 : transaction.kind === "void" ? 0 : 1;
  return {
    external_transaction_id: transaction.sourceId,
    transaction_date: transaction.occurredAt,
    business_date: transaction.businessDate,
    gross_amount: transaction.amountMinor * sign,
    tax_amount: transaction.taxMinor * sign,
    discount_amount: transaction.discountMinor * sign,
    net_amount: (transaction.amountMinor - transaction.taxMinor) * sign,
    payment_method: transaction.paymentMethod,
    source_metadata: { air_regi_state: transaction.kind, source_revision_at: transaction.revisionAt },
    items: transaction.items.map(item => ({
      external_item_id: item.sourceItemId, item_name: item.name, category_name: item.category,
      quantity: item.quantity * sign, unit_price: item.unitPriceMinor,
      total_amount: item.amountMinor * sign, tax_amount: item.taxMinor * sign, discount_amount: item.discountMinor * sign,
      source_metadata: { air_regi_state: transaction.kind }
    }))
  };
}
