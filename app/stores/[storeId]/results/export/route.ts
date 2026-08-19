import { getResultsVisibilityWorkspace } from "@/lib/results-visibility";
import { getStoreForApi } from "@/lib/stores";

function cell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const storeAccess = await getStoreForApi(storeId);
  if (!storeAccess.ok) {
    return Response.json(
      { error: storeAccess.status === 401 ? "ログインが必要です。" : "店舗を確認できませんでした。" },
      { status: storeAccess.status, headers: { "cache-control": "no-store" } }
    );
  }
  const workspace = await getResultsVisibilityWorkspace(storeId);
  const rows: Array<Array<unknown>> = [["検索キーワード", "区分", "取得元", "期間開始", "期間終了", "平均掲載順位", "表示回数", "クリック数", "CTR", "取得日時"]];
  for (const comparison of workspace.comparisons) {
    for (const [label, snapshot] of [["導入前", comparison.baseline], ["前期間", comparison.previous], ["現在", comparison.current]] as const) {
      rows.push([comparison.keyword.keyword, label, snapshot?.source === "search_console" ? "Google Search Console" : snapshot ? "手動登録" : "", snapshot?.period_start ?? "", snapshot?.period_end ?? "", snapshot?.average_position ?? "", snapshot?.impressions ?? "", snapshot?.clicks ?? "", snapshot ? `${(snapshot.ctr * 100).toFixed(2)}%` : "", snapshot?.fetched_at ?? ""]);
    }
  }
  rows.push([]);
  rows.push(["AI定点観測の質問", "観測日時", "店名掲載", "提示順", "モデル", "引用URL"]);
  for (const observation of workspace.aiObservations) {
    rows.push([observation.question_snapshot, observation.observed_at, observation.store_mentioned ? "あり" : "なし", observation.mention_position ?? "", observation.model, observation.cited_urls.map((citation) => citation.url).join(" ")]);
  }
  const csv = `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="aio-boost-results-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
