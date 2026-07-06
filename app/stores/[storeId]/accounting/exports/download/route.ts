import { buildAccountingCsv } from "@/lib/phase6/compliance-data";

export async function GET(_: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const csv = await buildAccountingCsv(storeId);
  const fileName = encodeURIComponent(`accounting-export-${storeId}.csv`);
  return new Response(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`
    }
  });
}
