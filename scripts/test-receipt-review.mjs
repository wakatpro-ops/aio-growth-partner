import assert from "node:assert/strict";
import { buildTaxBreakdown, normalizeInvoiceRegistrationNumber, receiptContentFingerprint, validateReceiptForApproval } from "../lib/phase6/receipt-review.ts";

const valid = {
  vendorName: "株式会社テスト",
  receiptDate: "2026-08-15",
  paymentMethod: "カード",
  categoryName: "仕入",
  invoiceRegistrationNumber: "T1234567890123",
  subtotalAmount: 1000,
  taxAmount: 88,
  totalAmount: 1088,
  taxRate: "10",
  summary: "テスト",
  reviewNotes: "",
  items: [
    { name: "標準税率", quantity: 1, amount: 550, tax_rate: "10", tax_amount: 50, confidence: 0.9 },
    { name: "軽減税率", quantity: 1, amount: 538, tax_rate: "8", tax_amount: 38, confidence: 0.9 }
  ]
};

assert.deepEqual(validateReceiptForApproval(valid), []);
assert.ok(validateReceiptForApproval({ ...valid, vendorName: "" }).includes("支払先"));
assert.ok(validateReceiptForApproval({ ...valid, totalAmount: 1 }).some((item) => item.includes("明細合計")));
assert.equal(normalizeInvoiceRegistrationNumber("t 1234-5678-90123"), "T1234567890123");
const breakdown = buildTaxBreakdown(valid.items, "10", 88);
assert.equal(breakdown.length, 2);
assert.equal(breakdown.find((row) => row.rate === "8")?.tax_amount, 38);
assert.equal(
  receiptContentFingerprint({ vendorName: " 株式会社 テスト ", receiptDate: "2026-08-15", totalAmount: "1,088", invoiceRegistrationNumber: "T1234567890123" }),
  receiptContentFingerprint({ vendorName: "株式会社テスト", receiptDate: "2026-08-15", totalAmount: 1088, invoiceRegistrationNumber: "T1234567890123" })
);
console.log("receipt review tests passed");
