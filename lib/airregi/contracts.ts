import { z } from "zod";

// AIOb's internal representation, NOT an invented Airレジ response schema.
// The official provider adapter must map the verified API specification here.
const money = z.number().int().nonnegative().max(999_999_999_999);
const id = z.string().trim().min(1).max(160);
const instant = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
export const transactionSchema = z.object({
  sourceId: id,
  revisionAt: instant,
  businessDate: day,
  occurredAt: instant,
  kind: z.enum(["sale", "refund", "void"]),
  amountMinor: money,
  taxMinor: money,
  discountMinor: money.default(0),
  paymentMethod: z.string().trim().max(100).default("未設定"),
  // Service fees / order-level adjustments must be mapped explicitly.
  adjustmentMinor: z.number().int().min(-999_999_999_999).max(999_999_999_999).default(0),
  items: z.array(z.object({
    sourceItemId: id,
    name: z.string().trim().min(1).max(300),
    category: z.string().trim().max(150).nullable().default(null),
    quantity: z.number().positive().max(100_000).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001),
    unitPriceMinor: money,
    amountMinor: money,
    taxMinor: money.default(0),
    discountMinor: money.default(0)
  }).strict()).max(500)
}).strict().superRefine((value, ctx) => {
  if (value.taxMinor > value.amountMinor) ctx.addIssue({ code: "custom", message: "tax exceeds sale" });
  if (value.items.some(item => item.taxMinor > item.amountMinor)) ctx.addIssue({ code: "custom", message: "item tax exceeds sale" });
  if (new Set(value.items.map(item => item.sourceItemId)).size !== value.items.length) ctx.addIssue({ code: "custom", message: "duplicate item identity" });
  if (value.items.length && value.items.reduce((sum, item) => sum + item.amountMinor, value.adjustmentMinor) !== value.amountMinor) {
    ctx.addIssue({ code: "custom", message: "item total does not reconcile" });
  }
}).transform(value => ({ ...value, items: [...value.items].sort((a, b) => a.sourceItemId.localeCompare(b.sourceItemId, "en")) }));
export const pageSchema = z.object({
  externalStoreId: id,
  transactions: z.array(transactionSchema).max(1000),
  nextCursor: z.string().min(1).max(2000).nullable(),
  watermark: instant.nullable()
}).strict();
export type AirRegiTransaction = z.infer<typeof transactionSchema>;
export type AirRegiPage = z.infer<typeof pageSchema>;
export type AirRegiCredentials = { apiKey: string; apiToken: string };
export type AirRegiAdapter = {
  specificationVersion: string;
  minimumIntervalSeconds: number;
  // Globally scoped identity, including account scope if provider IDs are local.
  probe(credentials: AirRegiCredentials, signal: AbortSignal): Promise<{ externalStoreId: string; name: string }>;
  readPage(input: { credentials: AirRegiCredentials; externalStoreId: string; cursor: string | null; watermark: string | null; signal: AbortSignal }): Promise<unknown>;
};
