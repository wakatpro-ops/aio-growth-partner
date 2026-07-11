import Link from "next/link";
import type { StoreAiReadiness } from "@/lib/store-ai/readiness";

type Variant = "hero" | "compact";

function priorityClass(priority: string) {
  if (priority === "最優先") return "badge priority-high";
  if (priority === "重要") return "badge priority-medium";
  return "badge";
}

export function StoreAiReadinessPanel({
  readiness,
  storeId,
  variant = "hero"
}: {
  readiness: StoreAiReadiness;
  storeId: string;
  variant?: Variant;
}) {
  const primaryAction = readiness.nextBestActions[0];

  return (
    <section className={variant === "hero" ? "ai-home-panel" : "card"}>
      <div className="ai-readiness-header">
        <div>
          <p className="eyebrow">店舗AI理解度</p>
          <h2>{readiness.score}% {readiness.stage}</h2>
          <p>{readiness.headline}</p>
        </div>
        {primaryAction ? (
          <Link className="button" href={primaryAction.href}>次に整える</Link>
        ) : (
          <Link className="button" href={`/stores/${storeId}/actions`}>次アクションを見る</Link>
        )}
      </div>
      <div className="readiness-meter" aria-label={`店舗AI理解度 ${readiness.score}%`}>
        <span style={{ width: `${readiness.score}%` }} />
      </div>
      <div className="readiness-steps">
        {readiness.items.map((item) => (
          <span className={item.complete ? "readiness-step done" : "readiness-step"} key={item.key}>
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export function StoreAiNextActions({ readiness }: { readiness: StoreAiReadiness }) {
  const actions = readiness.nextBestActions.length ? readiness.nextBestActions : readiness.items.slice(-3);

  return (
    <section className="card">
      <h2>次に入れるとAIがもっと良くなる情報</h2>
      <p>入力するほど、投稿文・月次レポート・顧客フォロー・請求管理の提案が店舗に合っていきます。</p>
      <div className="action-card-list">
        {actions.map((action) => (
          <article className="action-card" key={action.key}>
            <div className="action-card-head">
              <span className={priorityClass(action.priority)}>{action.priority}</span>
              <span className="badge badge-strong">{action.badge}</span>
            </div>
            <h3>{action.label}</h3>
            <p>{action.benefit}</p>
            <Link className="button secondary" href={action.href}>確認する</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export function StoreAiLearnedFeedback({ readiness }: { readiness: StoreAiReadiness }) {
  return (
    <section className="card">
      <h2>AIOが理解できるようになったこと</h2>
      {readiness.completedItems.length ? (
        <ul className="ai-learned-list">
          {readiness.completedItems.map((item) => (
            <li key={item.key}>
              <span className="badge badge-strong">理解済み</span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.learned}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">店舗プロフィールを整えると、AIOが店舗らしさを理解し始めます。</p>
      )}
    </section>
  );
}

export function StoreAiDataStatus({ readiness }: { readiness: StoreAiReadiness }) {
  const metrics = [
    ["商品・サービス", `${readiness.counts.items.toLocaleString("ja-JP")}件`],
    ["顧客", `${readiness.counts.customers.toLocaleString("ja-JP")}件`],
    ["売上データ", `${readiness.counts.salesTransactions.toLocaleString("ja-JP")}件`],
    ["請求書", `${readiness.counts.invoices.toLocaleString("ja-JP")}件`],
    ["データ取込", `${readiness.counts.dataImports.toLocaleString("ja-JP")}件`],
    ["集客アクション", `${readiness.counts.growthActions.toLocaleString("ja-JP")}件`]
  ];

  return (
    <section className="card">
      <h2>最近のデータ状況</h2>
      <div className="metric-grid">
        {metrics.map(([label, value]) => (
          <div className="metric-tile" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
