import type { CSSProperties } from "react";

export type VisualDatum = {
  label: string;
  value: number;
  displayValue?: string;
  detail?: string;
  tone?: "green" | "blue" | "amber" | "red" | "gray";
};

const palette = ["#248565", "#5478d4", "#d79628", "#8a63c7", "#d35f5f", "#6d7d78"];

export function DonutChart({ title, centerLabel, centerValue, data, emptyMessage }: {
  title: string;
  centerLabel: string;
  centerValue: string;
  data: VisualDatum[];
  emptyMessage: string;
}) {
  const valid = data.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const stops = valid.map((item, index) => {
    const start = total ? offset / total * 100 : 0;
    offset += item.value;
    const end = total ? offset / total * 100 : 0;
    return `${palette[index % palette.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });

  return (
    <section className="visual-card" aria-label={title}>
      <h3>{title}</h3>
      {total ? <div className="donut-layout">
        <div className="donut-chart" style={{ "--donut-segments": `conic-gradient(${stops.join(", ")})` } as CSSProperties} role="img" aria-label={`${title}。${valid.map((item) => `${item.label} ${item.displayValue ?? item.value}`).join("、")}`}>
          <span><small>{centerLabel}</small><strong>{centerValue}</strong></span>
        </div>
        <div className="donut-legend">
          {valid.map((item, index) => <div key={item.label}>
            <i style={{ background: palette[index % palette.length] }} />
            <span>{item.label}</span>
            <strong>{item.displayValue ?? item.value.toLocaleString("ja-JP")}</strong>
          </div>)}
        </div>
      </div> : <p className="visual-empty">{emptyMessage}</p>}
    </section>
  );
}

export function HorizontalBarChart({ title, data, emptyMessage, maxItems = 6 }: {
  title: string;
  data: VisualDatum[];
  emptyMessage: string;
  maxItems?: number;
}) {
  const rows = data.filter((item) => Number.isFinite(item.value) && item.value >= 0).slice(0, maxItems);
  const max = Math.max(...rows.map((item) => item.value), 0);
  return (
    <section className="visual-card" aria-label={title}>
      <h3>{title}</h3>
      {rows.length && max > 0 ? <div className="bar-chart" role="img" aria-label={`${title}。${rows.map((item) => `${item.label} ${item.displayValue ?? item.value}`).join("、")}`}>
        {rows.map((item) => <div className="bar-chart-row" key={item.label}>
          <div><span title={item.label}>{item.label}</span><strong>{item.displayValue ?? item.value.toLocaleString("ja-JP")}</strong></div>
          <div className="bar-chart-track"><i className={item.tone ? `tone-${item.tone}` : ""} style={{ width: `${Math.max(3, item.value / max * 100)}%` }} /></div>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>)}
      </div> : <p className="visual-empty">{emptyMessage}</p>}
    </section>
  );
}

export function StatusBar({ value, max, tone = "green", label }: { value: number; max: number; tone?: VisualDatum["tone"]; label: string }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return (
    <div className="status-bar" role="img" aria-label={`${label} ${Math.round(percent)}%`}>
      <i className={`tone-${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function ItemThumbnail({ name, imageUrl, size = "regular" }: { name: string; imageUrl?: string | null; size?: "small" | "regular" }) {
  const initial = Array.from(name.trim())[0] ?? "品";
  return imageUrl ? (
    <div className={`item-thumbnail ${size}`} role="img" aria-label={`${name}の画像`} style={{ backgroundImage: `url(${imageUrl})` }} />
  ) : (
    <div className={`item-thumbnail placeholder ${size}`} aria-hidden="true"><span>{initial}</span></div>
  );
}
