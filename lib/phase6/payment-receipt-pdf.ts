function utf16(text: string) {
  const bytes = [0xfe, 0xff];
  for (const char of text) { const code = char.charCodeAt(0); bytes.push((code >> 8) & 0xff, code & 0xff); }
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

function text(x: number, y: number, size: number, value: string) {
  return `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm <${utf16(value)}> Tj ET\n`;
}

function pdf(objects: string[]) {
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body, "ascii")); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, "ascii"));
}

export function createPaymentReceiptPdf(input: {
  receiptNumber: string; issuedAt: string; amount: number; issuedTo: string; storeName: string; storeAddress?: string | null;
  invoiceNumber: string; title: string; paymentMethod?: string | null; status?: string | null; reissueReason?: string | null;
  registrationNumber?: string | null; tax10Subtotal?: number; tax10Amount?: number; tax8Subtotal?: number; tax8Amount?: number;
}) {
  let content = "0.2 w\n";
  content += text(48, 790, 24, "領収書");
  content += text(360, 800, 12, input.storeName);
  content += text(360, 780, 9, input.storeAddress ?? "");
  content += text(48, 730, 14, `${input.issuedTo || "お客様"} 様`);
  content += text(48, 675, 12, "領収金額");
  content += text(180, 668, 24, `${Math.round(input.amount).toLocaleString("ja-JP")}円`);
  content += text(48, 620, 11, `但し ${input.title} の代金として`);
  content += text(48, 575, 10, `領収書番号: ${input.receiptNumber}`);
  content += text(48, 550, 10, `請求書番号: ${input.invoiceNumber}`);
  content += text(48, 525, 10, `領収日: ${new Date(input.issuedAt).toLocaleDateString("ja-JP")}`);
  content += text(48, 500, 10, `支払方法: ${input.paymentMethod ?? "Stripe"}`);
  content += text(320, 575, 9, `登録番号: ${input.registrationNumber || "未設定"}`);
  content += text(320, 550, 9, `10%対象: ${Math.round(input.tax10Subtotal ?? 0).toLocaleString("ja-JP")}円 / 税: ${Math.round(input.tax10Amount ?? 0).toLocaleString("ja-JP")}円`);
  content += text(320, 525, 9, `8%対象: ${Math.round(input.tax8Subtotal ?? 0).toLocaleString("ja-JP")}円 / 税: ${Math.round(input.tax8Amount ?? 0).toLocaleString("ja-JP")}円`);
  if (input.status === "void") content += text(48, 450, 16, "取消済み（返金・取消のため無効）");
  if (input.reissueReason) content += text(48, 420, 9, `再発行理由: ${input.reissueReason}`);
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UCS2-H /DescendantFonts [5 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}endstream`
  ]);
}
