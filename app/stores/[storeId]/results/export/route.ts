import { getResultsVisibilityWorkspace } from "@/lib/results-visibility";

function cell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const workspace = await getResultsVisibilityWorkspace(storeId);
  const rows: Array<Array<unknown>> = [["検索キーワード", "区分", "取得元", "期間開始", "期間終了", "平均掲載順位", "表示回数", "クリック数", "CTR", "取得日時"]];
  for (const comparison of workspace.comparisons) {
    for (const [label, snapshot] of [["導入前", comparison.baseline], ["現在", comparison.current]] as const) {
      rows.push([comparison.keyword.keyword, label, snapshot?.source === "search_console" ? "Google Search Console" : snapshot ? "手動登録" : "", snapshot?.period_start ?? "", snapshot?.period_end ?? "", snapshot?.average_position ?? "", snapshot?.impressions ?? "", snapshot?.clicks ?? "", snapshot ? `${(snapshot.ctr * 100).toFixed(2)}%` : "", snapshot?.fetched_at ?? ""]);
    }
  }
  const csv = `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="aio-boost-results-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
