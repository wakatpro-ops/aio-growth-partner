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
  return (
    <section className={variant === "hero" ? "ai-home-panel" : "card"}>
      <div className="ai-readiness-header">
        <div>
          <p className="eyebrow">AIおすすめ準備度</p>
          <h2>{readiness.score}% {readiness.stage}</h2>
          <p>{readiness.headline}</p>
        </div>
        <Link className="button" href={`/stores/${storeId}/aio-improvement`}>
          AIにおすすめされやすくする
        </Link>
      </div>
      <div className="readiness-meter" aria-label={`AIおすすめ準備度 ${readiness.score}%`}>
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
  const actions = readiness.nextBestActions;

  return (
    <section className="card">
      <h2>今日やること</h2>
      <p>効果が大きい順に並べています。最初は1件だけ終わらせれば大丈夫です。</p>
      {actions.length ? <div className="action-card-list">
        {actions.map((action) => (
          <article className="action-card" key={action.key}>
            <div className="action-card-head">
              <span className={priorityClass(action.priority)}>{action.priority}</span>
              <span className="badge badge-strong">{action.badge}</span>
            </div>
            <h3>{action.label}</h3>
            <p>{action.benefit}</p>
            <Link className="button secondary" href={action.href}>{action.label}を改善する</Link>
          </article>
        ))}
      </div> : <p className="notice success">今日必ず対応する改善はありません。外部への反映状況を定期的に確認してください。</p>}
    </section>
  );
}

export function StoreAiLearnedFeedback({ readiness }: { readiness: StoreAiReadiness }) {
  return (
    <section className="card">
      <h2>すでに整っている情報</h2>
      {readiness.completedItems.length ? (
        <ul className="ai-learned-list">
          {readiness.completedItems.map((item) => (
            <li key={item.key}>
              <span className="badge badge-strong">確認済み</span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.learned}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">店舗の基本情報を整えると、ここに確認済みの内容が表示されます。</p>
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
