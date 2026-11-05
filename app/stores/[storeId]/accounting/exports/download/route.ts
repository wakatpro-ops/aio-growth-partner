import { buildAccountingCsv } from "@/lib/phase6/compliance-data";
import { SalesFinancialDetailsError } from "@/lib/pos/financial-details";

export async function GET(request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "freee" ? "freee" : "standard";
  let csv: string;
  try { csv = await buildAccountingCsv(storeId, format); }
  catch (error) {
    if (error instanceof SalesFinancialDetailsError) {
      return Response.redirect(new URL(`/stores/${encodeURIComponent(storeId)}/accounting/exports?exportBlocked=${error.code}`, request.url), 303);
    }
    throw error;
  }
  const fileName = encodeURIComponent(`${format === "freee" ? "freee" : "accounting"}-export-${storeId}.csv`);
  return new Response(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`
    }
  });
}
