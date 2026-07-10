import { buildAccountingCsv } from "@/lib/phase6/compliance-data";

export async function GET(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "freee" ? "freee" : "standard";
  const csv = await buildAccountingCsv(storeId, format);
  const fileName = encodeURIComponent(`${format === "freee" ? "freee" : "accounting"}-export-${storeId}.csv`);
  return new Response(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`
    }
  });
}
