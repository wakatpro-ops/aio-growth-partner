"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DonutChart } from "@/components/ui/data-visuals";
import { validSalesTarget, type SalesDashboard, type SalesPoint } from "@/lib/sales/dashboard-rules";

function yen(value: number) { return `${Math.round(value).toLocaleString("ja-JP")}円`; }
function paymentLabel(value: string) {
  return ({ cash: "現金", credit_card: "クレジットカード", qr_payment: "QR決済", bank_transfer: "銀行振込", other: "その他", unset: "未設定", 未設定: "未設定" } as Record<string, string>)[value] ?? value;
}

export function SalesGoal({ storeId, month, total, target, editable }: { storeId: string; month: string; total: number; target: number | null; editable: boolean }) {
  const [confirmed, setConfirmed] = useState(target), [input, setInput] = useState(target === null ? "" : String(target));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const lock = useRef(false), router = useRouter();
  useEffect(() => { setConfirmed(target); setInput(target === null ? "" : String(target)); }, [target, month]);
  async function save(clear = false) {
    if (lock.current) return;
    const amount = clear ? null : input.trim() ? Number(input) : NaN;
    if (amount !== null && !validSalesTarget(amount)) { setMessage("目標は1〜1,000億円の整数で入力してください。"); return; }
    lock.current = true; setBusy(true); setMessage("");
    try {
      const result = await fetch(`/api/stores/${storeId}/sales-target`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, amount }) });
      const response = await result.json();
      if (!result.ok || response.saved !== true) throw new Error(response.error || "目標を保存できませんでした。");
      setConfirmed(amount); setInput(amount === null ? "" : String(amount)); setMessage(clear ? "目標設定を解除しました。以前の値は変更履歴に残ります。" : "今月の目標を保存しました。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "目標を保存できませんでした。"); }
    finally { lock.current = false; setBusy(false); }
  }
  const percent = confirmed === null ? null : total / confirmed * 100;
  return <div className="sales-goal">
    <div className="sales-goal-caption"><span>目標達成率</span><strong>{percent === null ? "目標未設定" : `${percent.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`}</strong></div>
    {percent !== null ? <><div className="sales-goal-track" role="progressbar" aria-label="月間売上の目標達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, percent))} aria-valuetext={`${percent.toFixed(1)}%`}><i style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}/></div><small>目標 {yen(confirmed!)}</small></> : null}
    {editable ? <details className="sales-target-settings"><summary>{confirmed === null ? "今月の目標を設定" : "目標を変更"}</summary>
      <form onSubmit={event => { event.preventDefault(); void save(); }}><label htmlFor="sales-month-target">{month}の売上目標（税込・円）</label><input id="sales-month-target" type="number" inputMode="numeric" min="1" max="100000000000" step="1" required value={input} disabled={busy} onChange={event => setInput(event.target.value)}/><button className="button secondary" disabled={busy}>{busy ? "保存しています…" : "目標を保存"}</button></form>
      {confirmed !== null ? <button type="button" className="text-link" disabled={busy} onClick={() => { if (window.confirm("今月の目標設定を解除しますか？売上データと以前の目標の変更履歴は残ります。")) void save(true); }}>目標設定を解除</button> : null}
    </details> : percent === null ? <small>店長・オーナーが設定できます</small> : null}
    {message ? <p className="sales-target-message" role="status">{message}</p> : null}
  </div>;
}

export function MonthlySalesSummary({ data, storeId, restaurant, editable }: { data: SalesDashboard | null; storeId: string; restaurant: boolean; editable: boolean }) {
  if (!data) return <p className="notice" role="status">今月の売上を取得できませんでした。データがないとは限りません。時間をおいて画面を開き直してください。</p>;
  const { current, period, guestDifference } = data;
  return <div className="sales-shared-summary">
    <p className="sales-summary-scope muted">今月・{period.start.replaceAll("-", "/")}〜{period.today.replaceAll("-", "/")}（税込・取込済みデータ）</p>
    <div className={`sales-kpi-strip monthly-sales-kpis${restaurant ? " restaurant" : ""}`} aria-label="今月の売上の主要数値">
      <article className="card"><p className="muted">月間売上</p><div className="metric">{yen(current.total)}</div><SalesGoal key={period.month} storeId={storeId} month={period.month} total={current.total} target={data.target} editable={editable}/>{current.count === 0 ? <small>今月の取り込みはまだありません</small> : null}</article>
      {!restaurant ? <article className="card"><p className="muted">取引件数</p><div className="metric">{current.count.toLocaleString("ja-JP")}件</div><small>今月の取込済み取引</small></article> : null}
      <article className="card"><p className="muted">{restaurant ? "平均客単価" : "平均取引額"}</p><div className="metric">{restaurant ? current.averageGuest === null ? "客数未取得" : yen(current.averageGuest) : current.averageTransaction === null ? "—" : yen(current.averageTransaction)}</div>
        {restaurant ? <>{guestDifference !== null ? <p className="sales-comparison">前月同期間比 {guestDifference > 0 ? "+" : guestDifference < 0 ? "−" : "±"}¥{Math.round(Math.abs(guestDifference)).toLocaleString("ja-JP")}</p> : <small>前月同期間比：比較データなし</small>}<small>{current.guestCount === null ? "会計件数を客数の代わりにはしていません" : `今月の売上 ÷ 確認済み客数 ${current.guestCount.toLocaleString("ja-JP")}人`}</small></> : <small>顧客単位の客単価とは区別しています</small>}
      </article>
    </div>
  </div>;
}

function Trend({ rows, daily, start, today }: { rows: SalesPoint[]; daily: boolean; start: string; today: string }) {
  const actualMin = Math.min(0, ...rows.map(row => row.amount)), actualMax = Math.max(0, ...rows.map(row => row.amount));
  const rawStep = (actualMax - actualMin) / 4 || 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep)), normalized = rawStep / magnitude;
  const step = Math.max(1, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude);
  const min = Math.floor(actualMin / step) * step;
  const max = Math.max(min + step, Math.ceil(actualMax / step) * step);
  const span = max - min, ticks = Math.round(span / step);
  const length = daily ? Number(today.slice(8)) : rows.length;
  const label = daily ? "日別売上推移" : "月別売上推移";
  function chart(compact: boolean) {
    const width = compact ? 360 : 800, height = compact ? 240 : 270, left = compact ? 57 : 65, right = 24, top = 24, bottom = 44;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const coordinates = rows.map((row, index) => ({ ...row, x: length <= 1 ? left + plotWidth / 2 : left + (daily ? Number(row.label.slice(8)) - 1 : index) / (length - 1) * plotWidth, y: top + (max - row.amount) / span * plotHeight }));
    const path = coordinates.map((point, index) => {
      const consecutive = !daily || (index > 0 && Number(point.label.slice(8)) - Number(coordinates[index - 1].label.slice(8)) === 1);
      return `${index === 0 || !consecutive ? "M" : "L"}${point.x},${point.y}`;
    }).join(" ");
    return <svg className={`sales-trend-chart monthly-sales-chart ${compact ? "compact-chart" : "wide-chart"}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}。${daily ? start : rows[0]?.label}から${daily ? today : rows.at(-1)?.label}。取込済みの日付のみ表示`}>
      {Array.from({ length: ticks + 1 }, (_, index) => {
        const value = Math.round(max - index * step);
        const axis = compact && Math.abs(value) >= 10000 ? `${Number((value / 10000).toFixed(1))}万` : value.toLocaleString("ja-JP");
        return <g key={index}><line className="sales-trend-gridline" x1={left} x2={width - right} y1={top + index / ticks * plotHeight} y2={top + index / ticks * plotHeight}/><text className="sales-trend-axis-label" x={left - 8} y={top + index / ticks * plotHeight + 4} textAnchor="end">{axis}</text></g>;
      })}
      <path className="sales-trend-line" d={path}/>
      {coordinates.map((point, index) => <g key={point.label}><circle className="sales-trend-point" cx={point.x} cy={point.y} r="4"><title>{`${point.label}：${yen(point.amount)}`}</title></circle>{index === 0 || index === rows.length - 1 || index % Math.max(1, Math.ceil(rows.length / (compact ? 4 : 6))) === 0 ? <text className="sales-trend-month-label" x={point.x} y={height - 14} textAnchor="middle">{daily ? `${Number(point.label.slice(8))}日` : `${Number(point.label.slice(5))}月`}</text> : null}</g>)}
    </svg>;
  }
  return <><div className="sales-trend-scroll">{chart(false)}{chart(true)}</div><details className="sales-chart-data"><summary>グラフの数値を見る</summary><div className="table-wrap"><table className="table compact"><thead><tr><th>{daily ? "日付" : "年月"}</th><th>売上（税込）</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{yen(row.amount)}</td></tr>)}</tbody></table></div></details></>;
}

export function MonthlySalesVisuals({ data, monthly }: { data: SalesDashboard | null; monthly: SalesPoint[] }) {
  const [view, setView] = useState<"daily" | "monthly">("daily");
  if (!data) return <p className="notice">グラフの元データを取得できませんでした。</p>;
  const historical = monthly.filter(row => row.label < data.period.month);
  // Current month must use exactly the same cutoff/source as the KPI, even if
  // the legacy monthly cache contains a future-dated transaction.
  const monthRows = [...historical, ...(data.current.count ? [{ label: data.period.month, amount: data.current.total, count: data.current.count }] : [])].sort((a, b) => a.label.localeCompare(b.label)).slice(-12);
  const rows = view === "daily" ? data.current.daily : monthRows;
  const payments = data.current.paymentMethods, negative = payments.some(row => row.amount < 0);
  return <div className="monthly-sales-visuals">
    <section className="card sales-trend-card" aria-labelledby="sales-trend-title">
      <div className="sales-trend-heading"><div><p className="eyebrow">{view === "daily" ? `${data.period.month}・今月` : "取込済みの各月"}</p><h3 id="sales-trend-title">{view === "daily" ? "日別売上推移" : "月別売上推移"}</h3></div>
        <div className="sales-chart-switch" role="group" aria-label="売上グラフの表示単位">{(["daily", "monthly"] as const).map(value => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value === "daily" ? "日別" : "月別"}</button>)}</div>
      </div>
      {rows.length ? <Trend rows={rows} daily={view === "daily"} start={data.period.start} today={data.period.today}/> : <p className="muted">{view === "daily" ? "今月の売上データはまだ取り込まれていません。" : "売上データを取り込むと月別の推移を確認できます。"}</p>}
      <p className="sales-trend-note">取込済みデータだけを表示しています。未取込の日は0円とみなさず、線をつなぎません。今月は今日までの金額です。</p>
    </section>
    <aside className="sales-payment-overview">
      {negative ? <section className="visual-card"><h3>支払方法の内訳（今月）</h3><p className="muted">返金・調整でマイナスの区分があるため、割合ではなく金額を表示します。</p><dl>{payments.map(row => <div key={row.label}><dt>{paymentLabel(row.label)}</dt><dd>{yen(row.amount)}</dd></div>)}</dl></section> : <DonutChart title="支払方法の内訳（今月）" centerLabel="月間売上" centerValue={yen(data.current.total)} data={payments.map(row => ({ label: paymentLabel(row.label), value: row.amount, displayValue: yen(row.amount) }))} emptyMessage="今月の支払方法データがありません。"/>}
      <p className="sales-trend-note">取込元で区別できない支払方法は「未設定」です。</p>
    </aside>
  </div>;
}
