import "server-only";
import type { IndustryConfig, Store } from "@/types/domain";
import type { BusinessDocument } from "@/types/phase2";

type PdfInput = {
  document: BusinessDocument;
  industry: IndustryConfig;
  kind: "estimate" | "invoice";
  store: Store;
};

function formatCurrency(value: number) {
  return `${value.toLocaleString("ja-JP")}円`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(value));
}

function toUtf16Hex(text: string) {
  const bytes: number[] = [0xfe, 0xff];
  for (const char of text) {
    const code = char.charCodeAt(0);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textLine(x: number, y: number, size: number, text: string) {
  return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm <${toUtf16Hex(text)}> Tj ET\n`;
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return `${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function buildPdf(objects: string[]) {
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "ascii"));
}

export function createBusinessDocumentPdf({ document, industry, kind, store }: PdfInput) {
  const label = kind === "estimate" ? industry.businessLabels.estimate : industry.businessLabels.invoice;
  const limitLabel = kind === "estimate" ? "有効期限" : "支払期限";
  const limitValue = kind === "estimate" ? document.expiry_date : document.due_date;
  const customerName = document.customer?.name ?? "未選択";
  const notes = document.notes || "備考はありません。";

  let content = "";
  content += "0.2 w\n";
  content += textLine(48, 790, 22, label);
  content += textLine(360, 802, 11, store.name);
  content += textLine(360, 784, 10, store.address || "住所未設定");
  content += textLine(360, 766, 10, store.phone || "電話番号未設定");
  content += line(48, 748, 547, 748);

  content += textLine(48, 708, 10, "顧客名");
  content += textLine(48, 682, 16, customerName);
  content += line(48, 672, 260, 672);

  content += textLine(330, 704, 10, `${label}番号`);
  content += textLine(430, 704, 10, document.document_number);
  content += textLine(330, 682, 10, "発行日");
  content += textLine(430, 682, 10, formatDate(document.issue_date));
  content += textLine(330, 660, 10, limitLabel);
  content += textLine(430, 660, 10, formatDate(limitValue));

  content += line(300, 605, 547, 605);
  content += textLine(320, 580, 11, "小計");
  content += textLine(450, 580, 11, formatCurrency(document.subtotal));
  content += line(300, 565, 547, 565);
  content += textLine(320, 540, 11, "消費税");
  content += textLine(450, 540, 11, formatCurrency(document.tax_total));
  content += line(300, 525, 547, 525);
  content += textLine(320, 495, 16, "合計");
  content += textLine(430, 495, 16, formatCurrency(document.total));
  content += line(300, 476, 547, 476);

  content += textLine(48, 420, 13, "備考");
  content += line(48, 406, 547, 406);
  notes.split("\n").slice(0, 8).forEach((noteLine, index) => {
    content += textLine(58, 380 - index * 20, 10, noteLine);
  });

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UCS2-H /DescendantFonts [5 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`
  ];

  return buildPdf(objects);
}
