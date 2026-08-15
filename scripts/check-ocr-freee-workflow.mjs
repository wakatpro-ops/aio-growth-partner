import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["detail review page", "app/stores/[storeId]/accounting/receipts/[receiptId]/page.tsx", "内容を確認して承認"],
  ["duplicate checksum", "lib/phase6/expense-receipts.ts", "fileSha256"],
  ["PDF text extraction", "lib/phase6/expense-receipts.ts", "pdfText"],
  ["low confidence", "lib/phase6/expense-receipts.ts", "lowConfidenceFields"],
  ["approval gate", "lib/phase6/freee-connect.ts", "approval_status !== \"approved\""],
  ["freee retry state", "lib/phase6/freee-connect.ts", "freee_attempt_count"],
  ["freee master options", "lib/phase6/freee-connect.ts", "refreshFreeeMasterOptions"],
  ["CSV fallback receipts", "lib/phase6/compliance-data.ts", "expense_receipts"],
  ["migration", "database/migrations/phase-ocr-freee-review-workflow.sql", "expense_receipts_store_file_sha256_active_uidx"]
];

for (const [label, file, expected] of checks) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (!content.includes(expected)) throw new Error(`${label} is missing`);
}
console.log("OCR/freee workflow checks passed");
