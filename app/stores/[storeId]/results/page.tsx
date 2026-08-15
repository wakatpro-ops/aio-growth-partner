import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ReportPrintButton } from "@/components/phase4/report-print-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { calculateMetricChange, getResultsVisibilityWorkspace } from "@/lib/results-visibility";
import { getStore } from "@/lib/stores";
import type { SearchVisibilitySnapshot } from "@/types/results-visibility";
import {
  addSearchVisibilityKeywordAction,
  archiveSearchVisibilityKeywordAction,
  recordManualSearchSnapshotAction,
  saveSearchVisibilitySettingAction,
  syncSearchConsoleAction
} from "./actions";

function dateLabel(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeZone: "Asia/Tokyo" }).format(new Date(`${value.slice(0, 10)}T00:00:00+09:00`)) : "未設定";
}

function metric(value: number | null | undefined, suffix = "") {
  return value === null || value === undefined ? "データなし" : `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}${suffix}`;
}

function periodLabel(snapshot: SearchVisibilitySnapshot | null) {
  return snapshot ? `${dateLabel(snapshot.period_start)}〜${dateLabel(snapshot.period_end)}` : "未計測";
}

function sourceLabel(snapshot: SearchVisibilitySnapshot | null) {
  if (!snapshot) return "-";
  return snapshot.source === "search_console" ? "Google Search Console" : "実測値を手動登録";
}

function total(snapshots: Array<SearchVisibilitySnapshot | null>, key: "impressions" | "clicks") {
  const available = snapshots.filter((snapshot): snapshot is SearchVisibilitySnapshot => Boolean(snapshot));
  return available.length ? available.reduce((sum, snapshot) => sum + Number(snapshot[key]), 0) : null;
}

function weightedPosition(snapshots: Array<SearchVisibilitySnapshot | null>) {
  const available = snapshots.filter((snapshot): snapshot is SearchVisibilitySnapshot => snapshot?.average_position !== null && snapshot?.average_position !== undefined);
  if (!available.length) return null;
  const weight = available.reduce((sum, snapshot) => sum + Math.max(1, Number(snapshot.impressions)), 0);
  return available.reduce((sum, snapshot) => sum + Number(snapshot.average_position) * Math.max(1, Number(snapshot.impressions)), 0) / weight;
}

function changeLabel(current: number | null, baseline: number | null, lowerIsBetter = false, suffix = "") {
  const change = calculateMetricChange(current, baseline, lowerIsBetter);
  if (!change) return { text: "比較待ち", className: "badge" };
  const sign = change.absolute > 0 ? "+" : "";
  return {
    text: change.unchanged ? "変化なし" : `${sign}${change.absolute.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}${suffix}`,
    className: `badge ${change.improved ? "result-up" : change.unchanged ? "" : "result-down"}`
  };
}

export default async function ResultsVisibilityPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; settingsSaved?: string; keywordAdded?: string; keywordDeleted?: string; snapshotSaved?: string; synced?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const workspace = await getResultsVisibilityWorkspace(store.id);
  const baselineSnapshots = workspace.comparisons.map((comparison) => comparison.baseline);
  const currentSnapshots = workspace.comparisons.map((comparison) => comparison.current);
  const baselineImpressions = total(baselineSnapshots, "impressions");
  const currentImpressions = total(currentSnapshots, "impressions");
  const baselineClicks = total(baselineSnapshots, "clicks");
  const currentClicks = total(currentSnapshots, "clicks");
  const baselinePosition = weightedPosition(baselineSnapshots);
  const currentPosition = weightedPosition(currentSnapshots);
  const today = new Date().toISOString().slice(0, 10);
  const setting = workspace.setting;
  const summaryMetrics = [
    { label: "Googleで見つけられた", value: metric(currentImpressions, "回"), change: changeLabel(currentImpressions, baselineImpressions, false, "回"), note: "登録キーワードの表示回数" },
    { label: "検索から選ばれた", value: metric(currentClicks, "回"), change: changeLabel(currentClicks, baselineClicks, false, "回"), note: "Google検索からのクリック" },
    { label: "平均掲載順位", value: metric(currentPosition, "位"), change: changeLabel(currentPosition, baselinePosition, true, "位"), note: "表示されたときの平均順位" }
  ];

  return (
    <AppShell>
      <div className="results-report">
        <PageHeader
          eyebrow={industry.name}
          title="成果を見る"
          description="導入前と現在を同じ条件で比べ、見つけられた・選ばれた・AIに紹介された変化を確認します。"
          action={<div className="button-row print-actions"><Link className="button secondary" href={`/stores/${store.id}/results/export`}>CSVを出力</Link><ReportPrintButton /></div>}
        />
        <div className="print-actions"><StoreBusinessNav store={store} /></div>
        {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
        {query.settingsSaved ? <p className="notice success">計測条件を保存しました。次は検索キーワードを登録してください。</p> : null}
        {query.keywordAdded ? <p className="notice success">検索キーワードを追加しました。</p> : null}
        {query.keywordDeleted ? <p className="notice success">検索キーワードを削除しました。計測履歴は保持され、削除済みから元に戻せます。</p> : null}
        {query.snapshotSaved ? <p className="notice success">実測値を保存し、導入前と現在の比較を更新しました。</p> : null}
        {query.synced ? <p className="notice success">Google Search Consoleの確定データを同期しました。</p> : null}

        {!workspace.storageReady ? <p className="notice danger">成果データの保存先へ接続できません。架空の順位は表示していません。担当者へお問い合わせください。</p> : null}

        <section className="results-hero">
          <div>
            <p className="eyebrow">導入前からの変化</p>
            <h2>{workspace.comparisons.some((item) => item.baseline && item.current) ? "成果が数字で確認できます" : "最初の基準値を登録しましょう"}</h2>
            <p>順位は場所や端末で変わるため、期間・条件を固定した平均掲載順位で比較します。順位保証ではなく、実測値の推移です。</p>
          </div>
          <div className="results-period"><span>導入基準日</span><strong>{dateLabel(setting?.baseline_date)}</strong><small>{setting?.comparison_days ?? 28}日間どうしで比較</small></div>
        </section>

        <section className="grid cols-3 results-metrics">
          {summaryMetrics.map((item) => (
            <article className="card" key={item.label}>
              <p className="eyebrow">{item.label}</p>
              <div className="metric">{item.value}</div>
              <span className={item.change.className}>{item.change.text}</span>
              <p className="muted">{item.note}</p>
            </article>
          ))}
        </section>

        <section className="card" id="keywords">
          <div className="section-heading"><div><p className="eyebrow">Google検索での変化</p><h2>検索キーワード別の導入前 → 現在</h2></div><span className="badge">{workspace.keywords.length}/10件</span></div>
          <p>地域とサービスを組み合わせた言葉を3〜10件登録すると、営業説明に偏りのない成果として使いやすくなります。</p>
          <form className="form-inline print-actions" action={addSearchVisibilityKeywordAction.bind(null, store.id)}>
            <div className="field"><label htmlFor="keyword">追加する検索キーワード</label><input id="keyword" name="keyword" placeholder="例：高円寺 ヘッドスパ" minLength={2} maxLength={120} required /></div>
            <div><p className="muted">お客様が実際に検索しそうな「地域＋目的」を登録します。</p></div>
            <PendingSubmitButton pendingLabel="追加しています...">キーワードを追加</PendingSubmitButton>
          </form>
          <div className="table-wrap">
            <table className="table results-table">
              <thead><tr><th>検索キーワード</th><th>導入前</th><th>現在</th><th>順位の変化</th><th className="print-actions">操作</th></tr></thead>
              <tbody>
                {workspace.comparisons.map((comparison) => {
                  const change = changeLabel(comparison.current?.average_position ?? null, comparison.baseline?.average_position ?? null, true, "位");
                  return (
                    <tr id={`keyword-${comparison.keyword.id}`} key={comparison.keyword.id}>
                      <td><strong>{comparison.keyword.keyword}</strong><br /><span className="muted">{sourceLabel(comparison.current ?? comparison.baseline)}</span></td>
                      <td><strong>{metric(comparison.baseline?.average_position, "位")}</strong><br /><span className="muted">表示 {metric(comparison.baseline?.impressions, "回")} / クリック {metric(comparison.baseline?.clicks, "回")}</span><br /><span className="muted">{periodLabel(comparison.baseline)}</span></td>
                      <td><strong>{metric(comparison.current?.average_position, "位")}</strong><br /><span className="muted">表示 {metric(comparison.current?.impressions, "回")} / クリック {metric(comparison.current?.clicks, "回")}</span><br /><span className="muted">{periodLabel(comparison.current)}</span></td>
                      <td><span className={change.className}>{change.text}</span></td>
                      <td className="print-actions">
                        <details className="inline-details"><summary>実測値を登録</summary>
                          <form className="form compact-form" action={recordManualSearchSnapshotAction.bind(null, store.id, comparison.keyword.id)}>
                            <div className="field"><label>比較区分</label><select name="period_kind" required><option value="baseline">導入前</option><option value="current">現在</option></select></div>
                            <div className="grid cols-2"><div className="field"><label>開始日</label><input name="period_start" type="date" required /></div><div className="field"><label>終了日</label><input name="period_end" type="date" defaultValue={today} required /></div></div>
                            <div className="grid cols-3"><div className="field"><label>平均掲載順位</label><input name="average_position" type="number" min="0" step="0.1" /></div><div className="field"><label>表示回数</label><input name="impressions" type="number" min="0" step="1" defaultValue="0" required /></div><div className="field"><label>クリック数</label><input name="clicks" type="number" min="0" step="1" defaultValue="0" required /></div></div>
                            <PendingSubmitButton pendingLabel="実測値を保存しています...">実測値を保存</PendingSubmitButton>
                          </form>
                        </details>
                        <form action={archiveSearchVisibilityKeywordAction.bind(null, store.id, comparison.keyword.id)}><ConfirmSubmitButton message={`「${comparison.keyword.keyword}」を削除済みに移します。過去の計測履歴は保持され、あとで元に戻せます。`}>削除</ConfirmSubmitButton></form>
                      </td>
                    </tr>
                  );
                })}
                {workspace.comparisons.length === 0 ? <tr><td colSpan={5}>検索キーワードはまだありません。上の入力欄から最初のキーワードを追加してください。</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="button-row print-actions"><Link className="button secondary" href={`/stores/${store.id}/results/deleted`}>削除済みキーワードを見る</Link></div>
        </section>

        <section className="grid cols-2 print-actions">
          <article className="card" id="measurement-settings">
            <p className="eyebrow">比較条件</p><h2>導入日と計測条件</h2>
            <form className="form" action={saveSearchVisibilitySettingAction.bind(null, store.id)}>
              <div className="field"><label htmlFor="baseline_date">AIO boost導入日</label><input id="baseline_date" name="baseline_date" type="date" defaultValue={setting?.baseline_date ?? today} required /></div>
              <div className="field"><label htmlFor="comparison_days">比較する日数</label><select id="comparison_days" name="comparison_days" defaultValue={String(setting?.comparison_days ?? 28)}><option value="7">7日間</option><option value="28">28日間（推奨）</option><option value="90">90日間</option></select></div>
              <div className="field"><label htmlFor="search_console_property_uri">Search Consoleプロパティ</label><input id="search_console_property_uri" name="search_console_property_uri" defaultValue={setting?.search_console_property_uri ?? ""} placeholder="sc-domain:example.com" /></div>
              <input type="hidden" name="country_filter" value="jpn" /><input type="hidden" name="device_filter" value="all" />
              <PendingSubmitButton pendingLabel="計測条件を保存しています...">計測条件を保存</PendingSubmitButton>
            </form>
          </article>
          <article className="card" id="search-console">
            <p className="eyebrow">自動取得</p><h2>Google Search Console</h2>
            <p>Google公式の確定データから、同じ検索語・期間・国・端末条件で平均掲載順位、表示、クリックを取得します。</p>
            <div className="status-list"><span><b>Google接続</b><em>{workspace.googleConnected ? "接続済み" : "未接続"}</em></span><span><b>Search Console閲覧権限</b><em>{workspace.searchConsoleScopeGranted ? "承認済み" : "未承認"}</em></span><span><b>最終同期</b><em>{setting?.last_synced_at ? new Date(setting.last_synced_at).toLocaleString("ja-JP") : "未同期"}</em></span></div>
            {setting?.last_error ? <p className="notice danger">前回の同期結果: {setting.last_error}</p> : null}
            <div className="button-row">
              {workspace.searchConsoleScopeGranted
                ? <form action={syncSearchConsoleAction.bind(null, store.id)}><PendingSubmitButton pendingLabel="Googleから同期しています...">Search Consoleを同期</PendingSubmitButton></form>
                : <Link className="button" href={`/api/google/oauth/start?storeId=${store.id}&capability=search_console`}>閲覧権限を追加</Link>}
              <Link className="button secondary" href={`/stores/${store.id}/settings/google`}>Google連携を確認</Link>
            </div>
            <p className="muted">閲覧専用権限だけを使用します。操作時にGoogle本人確認・同意画面が表示される場合があります。</p>
          </article>
        </section>

        <section className="grid cols-2 results-next-sources">
          <article className="static-card"><p className="eyebrow">Googleマップでの反応</p><h3>表示・電話・経路案内・サイト訪問</h3><p>Google Business Profile API承認後に自動表示します。公式APIで取得できない「マップ絶対順位」は架空表示しません。</p><span className="badge">API承認待ち</span></article>
          <article className="static-card"><p className="eyebrow">AIでの見つかり方</p><h3>目標質問での掲載率を定点観測</h3><p>単発回答を順位と断定せず、複数質問・複数回で店名掲載と引用URLの割合を測る領域です。</p><span className="badge">定点観測準備中</span></article>
        </section>

        <section className="card">
          <div className="section-heading"><div><p className="eyebrow">何を改善したか</p><h2>改善実施と成果を同じ時系列で確認</h2></div><Link className="text-link print-actions" href={`/stores/${store.id}/aio-improvement/history`}>AIO改善履歴を見る →</Link></div>
          <ol className="results-timeline">
            {workspace.completedImprovements.map((improvement) => <li key={improvement.id}><span>{dateLabel(improvement.completed_at)}</span><div><strong>{improvement.title}</strong><p>{improvement.change_summary ?? "改善完了として記録されています。"}</p></div></li>)}
            {workspace.completedImprovements.length === 0 ? <li><span>-</span><div><strong>完了した改善はまだありません</strong><p>AIO改善で変更内容を完了すると、ここに成果と一緒に表示されます。</p></div></li> : null}
          </ol>
        </section>

        <p className="results-disclaimer">この画面はGoogle等の実測値と定点観測結果を表示します。検索順位・AIによる推薦・売上を保証するものではなく、AIO boostだけによる因果関係を断定しません。各数値の取得元・期間・条件をご確認ください。</p>
      </div>
    </AppShell>
  );
}
