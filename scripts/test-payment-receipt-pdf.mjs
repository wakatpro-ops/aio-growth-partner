import assert from "node:assert/strict";
import { createPaymentReceiptPdf } from "../lib/phase6/payment-receipt-pdf.ts";

const bytes = createPaymentReceiptPdf({
  receiptNumber: "RCT-TEST-001",
  issuedAt: "2026-08-15T00:00:00.000Z",
  amount: 10960,
  issuedTo: "動作確認 顧客",
  storeName: "動作確認 店舗",
  storeAddress: "東京都杉並区",
  invoiceNumber: "INV-TEST-001",
  title: "10%・8%混在取引",
  paymentMethod: "Stripe",
  registrationNumber: "T1234567890123",
  tax10Subtotal: 5500,
  tax10Amount: 500,
  tax8Subtotal: 4460,
  tax8Amount: 460
});

const pdf = Buffer.from(bytes).toString("ascii");
const asUtf16Hex = (value) => [...value].flatMap((character) => {
  const code = character.charCodeAt(0);
  return [(code >> 8) & 0xff, code & 0xff];
}).map((value) => value.toString(16).padStart(2, "0")).join("");

assert.equal(pdf.slice(0, 8), "%PDF-1.4");
assert.ok(bytes.length > 1000);
assert.ok(pdf.includes(asUtf16Hex("T1234567890123")));
assert.ok(pdf.includes(asUtf16Hex("10%対象: 5,500円 / 税: 500円")));
assert.ok(pdf.includes(asUtf16Hex("8%対象: 4,460円 / 税: 460円")));
console.log("Payment receipt PDF tests passed");
