import Link from "next/link";
import type { AiUsageDashboard, AiUsageGroup, AiUsageMetrics } from "@/lib/ai-usage/dashboard";
import styles from "./usage.module.css";

const integers = new Intl.NumberFormat("ja-JP");
export const usageNumber = (value: number) => integers.format(value);
export function usageUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.000001) return "<$0.000001";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(value);
}
const yen = (value: number | null) => value === null ? "未設定" : `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value)}円`;
const percent = (value: number | null) => value === null ? "算出できません" : `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 }).format(value)}%`;
const timestamp = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "未確定";
const missingCost = (metrics: AiUsageMetrics) => metrics.requests - metrics.knownCostRequests;
const pricedCost = (metrics: AiUsageMetrics) => metrics.requests > 0 && metrics.knownCostRequests === 0 ? null : metrics.estimatedCostUsd;
const featureNames: Record<string, string> = {
  assistant: "店舗AI相談", marketing_conversation: "会話から投稿下書き", aio_conversation: "会話からAIO改善下書き", sales_conversation: "会話から売上・書類下書き", email_classification: "メール分類", receipt_extraction: "レシート読取", sns_image_analysis: "SNS画像解析", application_analysis: "申込内容整理", public_url_analysis: "URL店舗診断", ai_visibility: "AI定点観測",
  aio_diagnosis: "AIO診断", post_generation: "投稿文の生成", review_reply: "口コミ返信案", google_business_profile_draft: "Google店舗情報の下書き", instagram_draft_generation: "Instagram投稿案", ai_monthly_recommendations: "月次改善提案", sales_ai_monthly_report: "月次売上レポート", demand_action_recommendations: "需要・販促提案", growth_action_draft_generation: "集客施策の下書き", customer_segment_message: "顧客向けメッセージ"
};
const featureLabel = (key: string, fallback: string) => Object.hasOwn(featureNames, key) ? featureNames[key] : fallback;
function shiftedMonth(month: string, change: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + change, 1)).toISOString().slice(0, 7);
}
function ratioReason(data: AiUsageDashboard) {
  if (data.settings.usdJpy === null || data.settings.serviceRevenueJpy === null) return "下の計算条件で換算レート・利用料売上を設定してください。";
  if (data.settings.serviceRevenueJpy === 0) return "利用料売上が0円のため、比率は算出しません。";
  if (!data.monthCoverageComplete) return "月初からの計測がそろっていないため、比率は表示しません。";
  return "未計算のリクエストがあるため、比率は表示しません。";
}

export function AiUsageDashboardView({ dashboard: data }: { dashboard: AiUsageDashboard }) {
  const currentMonth = new Date(Date.parse(data.asOf) + 9 * 3600000).toISOString().slice(0, 7);
  const fullCost = missingCost(data.totals) === 0;
  const noCoverage = data.totals.requests === 0 && !data.monthCoverageComplete;
  return <>
    <section className={styles.toolbar} aria-label="集計期間">
      <form action="/admin/ai-logs" method="get" className={styles.monthForm}><label htmlFor="usage-month">集計月 <span>日本時間</span></label><div><input id="usage-month" type="month" name="month" defaultValue={data.month} min="2000-01" max="2099-12" required /><button className="button" type="submit">この月を表示</button></div></form>
      <nav className={styles.monthLinks} aria-label="月を切り替え">{data.month > "2000-01" ? <Link href={`/admin/ai-logs?month=${shiftedMonth(data.month, -1)}`}>← 前月</Link> : null}<Link href={`/admin/ai-logs?month=${currentMonth}`}>今月</Link>{data.month < currentMonth ? <Link href={`/admin/ai-logs?month=${shiftedMonth(data.month, 1)}`}>翌月 →</Link> : null}</nav>
      <p className={styles.asOf}>取得時点<br /><time dateTime={data.asOf}>{timestamp(data.asOf)} JST</time></p>
    </section>
    <div className={styles.coverage}><span className={styles.badge}>運営管理者のみ</span><span>計測開始：{timestamp(data.meteringStartedAt)} JST</span><span className={data.monthCoverageComplete ? styles.complete : styles.partial}>{data.monthCoverageComplete ? "月初からの記録あり" : "月全体の計測は未完了"}</span></div>
    {data.state === "unavailable" ? <section className={`notice danger ${styles.unavailable}`} role="alert"><h2>AI利用状況を取得できませんでした</h2><p>利用がない状態とは異なります。金額や件数をゼロとして表示していません。</p>{data.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<Link className="button secondary" href={`/admin/ai-logs?month=${data.month}`}>もう一度読み込む</Link></section> : <>
      {data.warnings.length ? <details className={styles.warnings} open={!data.monthCoverageComplete || !fullCost}><summary>集計の注意点（{data.warnings.length}件）</summary><ul>{data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
      <section className={styles.kpis} aria-label="月間のAI利用状況">
        <article className={`${styles.kpi} ${styles.primary}`}><p>記録済みAI費用 <span>USD・推定</span></p><strong>{noCoverage ? "未計測" : pricedCost(data.totals) === null ? "計算できません" : usageUsd(data.totals.estimatedCostUsd)}</strong><span className={styles.secondaryValue}>{noCoverage || pricedCost(data.totals) === null ? "過去分・未計算分をゼロにしません" : data.costJpy === null ? "円換算はレート未設定" : `参考円換算 ${yen(data.costJpy)}`}</span><small>{fullCost && data.monthCoverageComplete ? "選択月の記録分" : "計算できた記録分だけの小計"}。請求書の確定額ではありません。</small></article>
        <article className={styles.kpi}><p>月末の費用見込み <span>USD・推定</span></p><strong>{data.projection.available ? usageUsd(data.projection.estimatedCostUsd) : "まだ算出しません"}</strong><span className={styles.secondaryValue}>{data.projection.available ? data.projection.estimatedCostJpy === null ? "円換算はレート未設定" : yen(data.projection.estimatedCostJpy) : "十分な計測期間が必要です"}</span><small>{data.projection.reason}</small></article>
        <article className={styles.kpi}><p>API呼び出し <span>記録されたリクエスト</span></p><strong>{usageNumber(data.totals.requests)}<em>回</em></strong><span className={styles.secondaryValue}>{usageNumber(data.totals.operations)}処理 ／ 再試行 {usageNumber(data.totals.retries)}回</span><small>エラー {usageNumber(data.totals.errors)}回。1つの処理で複数回呼び出す場合があります。</small></article>
        <article className={styles.kpi}><p>AI費用 / AIOb利用料 <span>円換算・税抜売上比</span></p><strong>{percent(data.revenueRatioPercent)}</strong><span className={styles.secondaryValue}>{data.projection.revenueRatioPercent !== null ? `月末見込み ${percent(data.projection.revenueRatioPercent)}` : "分母：AIOb月額利用料の合計"}</span><small>{data.revenueRatioPercent === null ? ratioReason(data) : `利用料売上 ${yen(data.settings.serviceRevenueJpy)}（税抜）。店舗の売上は含めません。`}</small></article>
      </section>
      <section className={`card ${styles.tokenSection}`} aria-labelledby="token-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>使用量の内訳</p><h2 id="token-title">トークンと追加ツール</h2></div><span className={styles.note}>キャッシュは入力の内数。重ねて加算しません。</span></div>
        <div className={styles.tokenGrid}><Token label="入力トークン合計" value={data.totals.inputTokens} note="キャッシュ読取・書込分を含む" /><Token label="出力トークン" value={data.totals.outputTokens} note="AIが生成した分" /><Token label="キャッシュ読取" value={data.totals.cachedInputTokens} note="入力のうち再利用された分" /><Token label="キャッシュ書込" value={data.totals.cacheWriteTokens} note="プロバイダーが返した書込分" /></div>
        <div className={styles.tokenFoot}><span>Web検索 {usageNumber(data.totals.webSearchCalls)}回</span><span>トークン費用小計 {pricedCost(data.totals) === null ? "計算不可" : usageUsd(data.totals.tokenCostUsd)}</span><span>ツール費用小計 {pricedCost(data.totals) === null ? "計算不可" : usageUsd(data.totals.toolCostUsd)}（総費用に含む）</span></div>
        {(data.totals.usageMissingCount > 0 || data.totals.cacheDetailsMissingCount > 0) ? <p className={styles.caution}>使用量未取得 {usageNumber(data.totals.usageMissingCount)}回 ／ キャッシュ内訳未取得 {usageNumber(data.totals.cacheDetailsMissingCount)}回。上の値は取得できた分だけです。未取得分は0トークンを意味しません。</p> : null}
      </section>
      <section className={`card ${styles.trendSection}`} aria-labelledby="day-trend-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>月の中での変化</p><h2 id="day-trend-heading">日別の推定費用</h2></div><span className={styles.note}>JST / USD / 計算可能分</span></div><DayTrend dashboard={data} /></section>
      <RecentUsage dashboard={data} />
      <UsageGroups title="店舗別の利用状況" description="店舗未割当・申込前の利用も含め、記録された全グループを表示します。" groups={data.stores} scope="store" rate={data.settings.usdJpy} />
      <UsageGroups title="機能別の利用状況" description="どの処理で費用・再試行が発生しているかを確認できます。" groups={data.features} scope="feature" rate={data.settings.usdJpy} />
      <section className={styles.method}><h2>この画面の見方</h2><p>APIの使用量と記録時の料金条件から推定しています。未登録の料金・取得できなかった使用量、計測開始前の利用を後から推測して埋めることはありません。割引・税・請求調整などにより、プロバイダーの請求書とは一致しない場合があります。</p><p>再試行は同一処理内で増えた呼び出しです。エラー時でも使用量が返された場合は費用に含まれます。この画面には入力文・出力文・連絡先を表示しません。</p></section>
    </>}
  </>;
}

function Token({ label, value, note }: { label: string; value: number; note: string }) {
  return <div><p>{label}</p><strong>{usageNumber(value)}</strong><small>{note}</small></div>;
}

type DayPoint = { key: string; day: number; measured: boolean; partial: boolean; metrics?: AiUsageGroup; amount: number | null };
export function usageDayPoints(data: AiUsageDashboard): DayPoint[] {
  const [year, month] = data.month.split("-").map(Number);
  const days = new Map(data.days.map((day) => [day.key, day]));
  const start = data.meteringStartedAt ? Date.parse(data.meteringStartedAt) : NaN;
  const asOf = Date.parse(data.asOf);
  return Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, index) => {
    const day = index + 1, key = `${data.month}-${String(day).padStart(2, "0")}`;
    const at = Date.parse(`${key}T00:00:00+09:00`), metrics = days.get(key);
    const measured = Number.isFinite(start) && at + 86400000 > start && at < asOf;
    return { key, day, measured, partial: measured && (start > at || asOf < at + 86400000), metrics, amount: metrics ? pricedCost(metrics) : measured ? 0 : null };
  });
}

function DayTrend({ dashboard }: { dashboard: AiUsageDashboard }) {
  const points = usageDayPoints(dashboard);
  const maximum = Math.max(...points.map((point) => point.amount ?? 0), 0);
  const scale = maximum || 1, width = 900, height = 225, left = 74, top = 16, plotHeight = 160, plotWidth = 806;
  const step = plotWidth / points.length;
  const valueLabel = (point: DayPoint) => point.amount === null ? point.metrics ? "費用未計算" : "計測対象外・未計測" : `${usageUsd(point.amount)}${point.metrics && missingCost(point.metrics) > 0 ? "（小計）" : ""}`;
  return <><figure className={styles.chart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="usage-chart-title usage-chart-description">
      <title id="usage-chart-title">{`${dashboard.month}の日別AI推定費用（USD）`}</title><desc id="usage-chart-description">計算可能な費用の棒グラフです。未計測・未計算の日は斜線、計測途中または未計算分のある日は橙色で表示します。全日の数値は下の表で確認できます。</desc>
      <defs><pattern id="usage-no-data" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#d5ded7" strokeWidth="2" /></pattern></defs>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - 20} y1={top + plotHeight * (1 - fraction)} y2={top + plotHeight * (1 - fraction)} stroke="#e1e7e0" /><text x={left - 10} y={top + plotHeight * (1 - fraction) + 4} textAnchor="end" className={styles.axis}>{maximum ? usageUsd(scale * fraction) : fraction === 0 ? "$0" : ""}</text></g>)}
      {points.map((point, index) => {
        const barHeight = point.amount === null ? 10 : point.amount === 0 ? 2 : Math.max(2, point.amount / scale * plotHeight);
        return <g key={point.key}><rect x={left + index * step + 3} y={top + plotHeight - barHeight} width={Math.max(3, step - 6)} height={barHeight} rx="2" fill={point.amount === null ? "url(#usage-no-data)" : point.partial || point.metrics && missingCost(point.metrics) > 0 ? "#bb8736" : "#287a5f"}><title>{`${point.key}：${valueLabel(point)}${point.partial ? "（当日途中・部分計測）" : ""}`}</title></rect>{[1, 8, 15, 22, points.length].includes(point.day) ? <text x={left + (index + 0.5) * step} y={top + plotHeight + 24} textAnchor="middle" className={styles.axis}>{point.day}日</text> : null}</g>;
      })}
    </svg>
    <figcaption><span><i className={styles.legendMeasured} />計測済み</span><span><i className={styles.legendPartial} />途中・小計</span><span><i className={styles.legendUnknown} />未計測・未計算</span></figcaption>
  </figure>
    <details className={styles.dayDetails}><summary>日別の正確な数値を確認</summary><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="日別利用明細"><table className={styles.table}><caption>{dashboard.month} / 日本時間。未計測の日を0円として扱いません。</caption><thead><tr><th scope="col">日付</th><th scope="col">推定費用（USD）</th><th scope="col">API呼出</th><th scope="col">再試行</th><th scope="col">入力</th><th scope="col">出力</th><th scope="col">計測状態</th></tr></thead><tbody>{points.map((point) => <tr key={point.key}><th scope="row">{point.key}</th><td>{valueLabel(point)}</td><td>{point.measured || point.metrics ? usageNumber(point.metrics?.requests ?? 0) : "—"}</td><td>{point.measured || point.metrics ? usageNumber(point.metrics?.retries ?? 0) : "—"}</td><td>{point.measured || point.metrics ? usageNumber(point.metrics?.inputTokens ?? 0) : "—"}</td><td>{point.measured || point.metrics ? usageNumber(point.metrics?.outputTokens ?? 0) : "—"}</td><td>{!point.measured ? "未計測・対象外" : point.partial ? "部分計測" : "計測済み"}{point.metrics && missingCost(point.metrics) > 0 ? ` / 未計算${point.metrics.requests - point.metrics.knownCostRequests}回` : ""}</td></tr>)}</tbody></table></div></details>
  </>;
}

function UsageGroups({ title, description, groups, scope, rate }: { title: string; description: string; groups: AiUsageGroup[]; scope: "store" | "feature"; rate: number | null }) {
  return <section className={`card ${styles.groupSection}`} aria-labelledby={`usage-${scope}-title`}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>費用の内訳</p><h2 id={`usage-${scope}-title`}>{title}</h2><p className={styles.note}>{description}</p></div><span className={styles.badge}>{usageNumber(groups.length)}{scope === "store" ? "グループ" : "機能"}</span></div>
    {!groups.length ? <p className={styles.empty}>この月に記録された{scope === "store" ? "店舗別" : "機能別"}の利用はありません。計測開始前の利用は含まれません。</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={title}><table className={styles.table}><caption>費用の高い順。金額は推定USD、キャッシュ読取は入力トークンの内数です。横にスクロールすると全項目を確認できます。</caption><thead><tr><th scope="col">{scope === "store" ? "店舗" : "機能"}</th><th scope="col">推定費用（USD）</th><th scope="col">API呼出</th><th scope="col">処理</th><th scope="col">再試行</th><th scope="col">エラー</th><th scope="col">入力合計</th><th scope="col">出力</th><th scope="col">キャッシュ読取</th><th scope="col">キャッシュ書込</th><th scope="col">未計算</th></tr></thead><tbody>{groups.map((group) => <tr key={group.key}><th scope="row"><span className={styles.groupLabel}>{scope === "feature" ? featureLabel(group.key, group.label) : group.label}</span>{scope === "feature" ? <small className={styles.groupCode}>{group.key}</small> : null}</th><td><strong>{pricedCost(group) === null ? "計算不可" : usageUsd(group.estimatedCostUsd)}</strong>{missingCost(group) > 0 ? <small>計算可能分の小計</small> : null}{rate !== null && pricedCost(group) !== null ? <small>{yen(group.estimatedCostUsd * rate)}</small> : null}</td><td>{usageNumber(group.requests)}</td><td>{usageNumber(group.operations)}</td><td>{usageNumber(group.retries)}</td><td>{usageNumber(group.errors)}</td><td>{usageNumber(group.inputTokens)}</td><td>{usageNumber(group.outputTokens)}</td><td>{usageNumber(group.cachedInputTokens)}{group.cacheDetailsMissingCount ? <small>内訳未取得あり</small> : null}</td><td>{usageNumber(group.cacheWriteTokens)}</td><td>{usageNumber(missingCost(group))}<small>使用量未取得 {usageNumber(group.usageMissingCount)}<br />料金未登録 {usageNumber(group.unpricedCount)}</small></td></tr>)}</tbody></table></div>}
  </section>;
}

function RecentUsage({ dashboard: data }: { dashboard: AiUsageDashboard }) {
  const at = Date.parse(data.asOf), currentStart = new Date(at - 86400000).toISOString(), previousStart = new Date(at - 172800000).toISOString();
  return <section className={`card ${styles.recentSection}`} aria-labelledby="usage-recent-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>急増の確認 · 選択月とは別集計</p><h2 id="usage-recent-title">直近24時間の利用</h2><p className={styles.note}>{timestamp(currentStart)}〜{timestamp(data.asOf)} JST<br />比較：{timestamp(previousStart)}〜{timestamp(currentStart)} JST</p></div><span className={styles.badge}>直近24時間 vs その前の24時間</span></div>
    {!data.recent.coverageComplete ? <p className={styles.empty}>比較する48時間の計測がそろっていないため、急増かどうかは判定しません。</p> : <><div className={styles.recentStats}><div><span>API呼び出し</span><strong>{usageNumber(data.recent.current.requests)}<small>回</small></strong><p>前24時間 {usageNumber(data.recent.previous.requests)}回</p></div><div><span>再試行 / エラー</span><strong>{usageNumber(data.recent.current.retries)}<small> / </small>{usageNumber(data.recent.current.errors)}</strong><p>前24時間 {usageNumber(data.recent.previous.retries)} / {usageNumber(data.recent.previous.errors)}</p></div><div><span>推定費用（記録分）</span><strong>{pricedCost(data.recent.current) === null ? "計算不可" : usageUsd(data.recent.current.estimatedCostUsd)}</strong><p>前24時間 {pricedCost(data.recent.previous) === null ? "計算不可" : usageUsd(data.recent.previous.estimatedCostUsd)}</p>{missingCost(data.recent.current) > 0 ? <p className={styles.caution}>未計算 {usageNumber(missingCost(data.recent.current))}回あり</p> : null}</div></div>
      {data.spikes.length ? <div className={styles.spikes}><h3>増加を確認したい店舗・機能</h3><p className={styles.note}>利用増は異常を意味しません。処理の追加や再試行の増加を確認してください。</p><ul>{data.spikes.map((spike) => <li key={`${spike.scope}:${spike.key}`}><div><span className={styles.scopeLabel}>{spike.scope === "store" ? "店舗" : "機能"}</span><strong>{spike.scope === "feature" ? featureLabel(spike.key, spike.label) : spike.label}</strong></div><div><span>{usageNumber(spike.previous.requests)} → <strong>{usageNumber(spike.current.requests)}回</strong></span><span className={styles.increase}>{spike.kind === "new_activity" ? "前24時間は0回" : spike.requestRatio === null ? "比較不可" : `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(spike.requestRatio)}倍`}</span></div><p>再試行 {usageNumber(spike.current.retries)}回 ／ エラー {usageNumber(spike.current.errors)}回</p></li>)}</ul></div> : <p className={styles.quiet}>記録上、急増の確認候補はありません。</p>}</>}
  </section>;
}
