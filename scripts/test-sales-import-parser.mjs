import { MAX_IMPORT_ROWS, parseImportFile } from "../lib/phase4/import-parser.ts";
import { buildImportStorageFileName } from "../lib/storage-object-name.ts";

const encode = (value) => new TextEncoder().encode(value).buffer;

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function simpleSalesPdf() {
  const content = "BT /F1 12 Tf 50 760 Td (sale_date) Tj 120 0 Td (item_name) Tj 140 0 Td (gross_amount) Tj -260 -24 Td (2026-08-15) Tj 120 0 Td (Test Item) Tj 140 0 Td (1000) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const buffer = Buffer.from(pdf, "binary");
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

const valid = await parseImportFile("sales.csv", encode("売上日,商品名,合計\n2026-08-15,商品A,1000"));
requireCheck(valid.importType === "csv" && valid.rows.length === 1, "正常CSVを解析できませんでした。");

const japaneseStorageName = buildImportStorageFileName("売上明細_20260821185743.csv", "898cbf80c23446ce98b1fad04599770c");
requireCheck(japaneseStorageName === "20260821185743-898cbf80c23446ce.csv", "日本語ファイル名を安全なStorageキーへ変換できませんでした。");
requireCheck(/^[a-zA-Z0-9_-]+\.(csv|tsv|xlsx|xls|pdf|bin)$/u.test(japaneseStorageName), "Storageファイル名に利用できない文字が残っています。");

const traversalStorageName = buildImportStorageFileName("../../顧客 売上?.CSV", "not-a-checksum");
requireCheck(traversalStorageName === "sales-import-file.csv", "パストラバーサルを含むファイル名を安全に変換できませんでした。");
requireCheck(!traversalStorageName.includes("/") && !traversalStorageName.includes(".."), "Storageファイル名にパス文字が残っています。");

const validPdf = await parseImportFile("sales.pdf", simpleSalesPdf());
requireCheck(validPdf.importType === "pdf" && validPdf.rows.length === 1 && validPdf.headers.length === 3, "正常な表形式PDFを解析できませんでした。");

await Promise.all([
  parseImportFile("empty.csv", encode("")).then(() => { throw new Error("空ファイルが拒否されませんでした。"); }, (error) => requireCheck(String(error).includes("空ファイル"), "空ファイルのエラーが不明確です。")),
  parseImportFile("broken.pdf", encode("not-a-pdf")).then(() => { throw new Error("破損PDFが拒否されませんでした。"); }, (error) => requireCheck(String(error).includes("PDFから表形式"), "破損PDFのエラーが不明確です。")),
  parseImportFile("sales.exe", encode("a,b\n1,2")).then(() => { throw new Error("未対応形式が拒否されませんでした。"); }, (error) => requireCheck(String(error).includes("CSV、TSV、Excel、PDF"), "未対応形式のエラーが不明確です。"))
]);

const largeRows = ["売上日,商品名,合計", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => `2026-08-15,商品${index},1000`)].join("\n");
await parseImportFile("large.csv", encode(largeRows)).then(
  () => { throw new Error("行数超過ファイルが拒否されませんでした。"); },
  (error) => requireCheck(String(error).includes("ファイルを分割"), "行数超過の案内が不明確です。")
);

console.log("Sales import parser and safe Storage object name tests passed.");
