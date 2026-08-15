import crypto from "node:crypto";

export type ReceiptLine = {
  name: string;
  quantity: number;
  amount: number;
  tax_rate: string;
  tax_amount: number;
  confidence: number | null;
};

export type ReceiptReviewDraft = {
  vendorName: string;
  receiptDate: string;
  paymentMethod: string;
  categoryName: string;
  invoiceRegistrationNumber: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: string;
  summary: string;
  reviewNotes: string;
  items: ReceiptLine[];
};

export function receiptNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[,￥円\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeTaxRate(value: unknown) {
  const text = String(value ?? "").trim();
  if (/8/.test(text)) return "8";
  if (/10/.test(text)) return "10";
  if (/0|非課税|不課税|対象外/.test(text)) return "0";
  return text.slice(0, 20);
}

export function normalizeInvoiceRegistrationNumber(value: unknown) {
  const normalized = String(value ?? "").toUpperCase().replace(/[^T0-9]/g, "");
  return /^T\d{13}$/.test(normalized) ? normalized : normalized.slice(0, 14);
}

export function parseReceiptLines(formData: FormData): ReceiptLine[] {
  const names = formData.getAll("item_name");
  const quantities = formData.getAll("item_quantity");
  const amounts = formData.getAll("item_amount");
  const taxRates = formData.getAll("item_tax_rate");
  const taxAmounts = formData.getAll("item_tax_amount");
  return names.map((value, index) => ({
    name: String(value ?? "").trim().slice(0, 200),
    quantity: Math.max(0, receiptNumber(quantities[index]) || 1),
    amount: Math.max(0, receiptNumber(amounts[index])),
    tax_rate: normalizeTaxRate(taxRates[index]),
    tax_amount: Math.max(0, receiptNumber(taxAmounts[index])),
    confidence: null
  })).filter((item) => item.name || item.amount > 0);
}

export function receiptDraftFromForm(formData: FormData): ReceiptReviewDraft {
  return {
    vendorName: String(formData.get("vendor_name") ?? "").trim().slice(0, 200),
    receiptDate: String(formData.get("receipt_date") ?? "").trim(),
    paymentMethod: String(formData.get("payment_method") ?? "").trim().slice(0, 100),
    categoryName: String(formData.get("category_name") ?? "").trim().slice(0, 120),
    invoiceRegistrationNumber: normalizeInvoiceRegistrationNumber(formData.get("invoice_registration_number")),
    subtotalAmount: Math.max(0, receiptNumber(formData.get("subtotal_amount"))),
    taxAmount: Math.max(0, receiptNumber(formData.get("tax_amount"))),
    totalAmount: Math.max(0, receiptNumber(formData.get("total_amount"))),
    taxRate: normalizeTaxRate(formData.get("tax_rate")),
    summary: String(formData.get("ai_summary") ?? "").trim().slice(0, 2000),
    reviewNotes: String(formData.get("review_notes") ?? "").trim().slice(0, 2000),
    items: parseReceiptLines(formData)
  };
}

export function validateReceiptForApproval(draft: ReceiptReviewDraft) {
  const missing: string[] = [];
  if (!draft.vendorName) missing.push("支払先");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.receiptDate)) missing.push("支払日");
  if (draft.totalAmount <= 0) missing.push("合計金額");
  if (draft.invoiceRegistrationNumber && !/^T\d{13}$/.test(draft.invoiceRegistrationNumber)) {
    missing.push("適格請求書発行事業者の登録番号（T＋13桁）");
  }
  if (draft.taxAmount > draft.totalAmount) missing.push("税額（合計金額以下）");
  const itemTotal = draft.items.reduce((sum, item) => sum + item.amount, 0);
  if (draft.items.length > 0 && Math.abs(itemTotal - draft.totalAmount) > 1) {
    missing.push("明細合計と合計金額の一致");
  }
  return missing;
}

export function buildTaxBreakdown(items: ReceiptLine[], fallbackRate: string, fallbackTax: number) {
  const grouped = new Map<string, { rate: string; amount: number; tax_amount: number }>();
  for (const item of items) {
    const rate = normalizeTaxRate(item.tax_rate) || normalizeTaxRate(fallbackRate) || "10";
    const current = grouped.get(rate) ?? { rate, amount: 0, tax_amount: 0 };
    current.amount += item.amount;
    current.tax_amount += item.tax_amount;
    grouped.set(rate, current);
  }
  if (grouped.size === 0) {
    const rate = normalizeTaxRate(fallbackRate) || "10";
    grouped.set(rate, { rate, amount: 0, tax_amount: fallbackTax });
  }
  return [...grouped.values()].map((row) => ({
    ...row,
    amount: Math.round(row.amount),
    tax_amount: Math.round(row.tax_amount)
  }));
}

export function receiptContentFingerprint(input: {
  vendorName?: unknown;
  receiptDate?: unknown;
  totalAmount?: unknown;
  invoiceRegistrationNumber?: unknown;
}) {
  const normalized = [
    String(input.vendorName ?? "").trim().toLowerCase().replace(/\s+/g, ""),
    String(input.receiptDate ?? "").slice(0, 10),
    String(Math.round(receiptNumber(input.totalAmount))),
    normalizeInvoiceRegistrationNumber(input.invoiceRegistrationNumber)
  ].join("|");
  if (normalized === "||0|") return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export function lowConfidenceFields(confidence: Record<string, unknown> | null | undefined, threshold = 0.75) {
  return Object.entries(confidence ?? {})
    .filter(([, value]) => typeof value === "number" && value < threshold)
    .map(([key]) => key);
}
