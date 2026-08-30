import Link from "next/link";
import type { CSSProperties } from "react";
import { AiRobotPortrait } from "@/components/brand/ai-robot";
import type { StoreCommandCenter } from "@/lib/store-command-center";

function Sparkline({ points, available }: { points: number[]; available: boolean }) {
  if (!available || points.length < 2) return <span className="command-sparkline-empty">データ待ち</span>;
  const width = 130;
  const height = 42;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points.map((value, index) => {
    const x = points.length === 1 ? width / 2 : index / (points.length - 1) * width;
    const y = height - 4 - ((value - min) / range) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="command-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="実データの推移">
      <polyline points={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function ScoreGauge({ score }: { score: number }) {
  return (
    <div className="command-score-wrap">
      <div className="command-score-gauge" style={{ "--command-score": `${score * 3.6}deg` } as CSSProperties} role="img" aria-label={`運営データ確認度 ${score}%`}>
        <div><strong>{score}</strong><span>/100</span></div>
      </div>
      <p><strong>運営データ確認度</strong><span>接続済みデータの範囲です。経営成績ではありません。</span></p>
    </div>
  );
}

export function StoreCommandCenterView({ dashboard }: { dashboard: StoreCommandCenter }) {
  const { store } = dashboard;
  return (
    <div className="store-command-center">
      <section className="command-focus-strip" aria-label="この業種で確認する主なトピックス">
        <span>{dashboard.industryName}で確認すること</span>
        <div>{dashboard.focusLabels.map((label) => <strong key={label}>{label}</strong>)}</div>
      </section>

      <div className="command-layout">
        <aside className="command-kpi-column">
          <section className="command-panel command-score-panel">
            <ScoreGauge score={dashboard.coverageScore} />
            <details>
              <summary>確認度の内訳を見る</summary>
              <ul>{dashboard.coverageItems.map((item) => <li className={item.ready ? "ready" : "missing"} key={item.label}><span>{item.ready ? "✓" : "−"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></li>)}</ul>
            </details>
          </section>

          <section className="command-metric-list" aria-label="店舗KPI">
            {dashboard.metrics.map((metric) => (
              <Link className={`command-metric ${metric.available ? "available" : "unavailable"}`} href={metric.href} key={metric.key}>
                <div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.changeLabel}</small></div>
                <Sparkline points={metric.points} available={metric.available} />
              </Link>
            ))}
          </section>
          {dashboard.enabledAreas.sales ? <Link className="command-text-link" href={`/stores/${store.id}/sales/reports`}>売上レポートを確認する →</Link> : null}
        </aside>

        <section className="command-main-column" aria-label="AIによる店舗状況と集客下書き">
          <section className="command-panel command-ai-briefing">
            <AiRobotPortrait />
            <div className="command-ai-copy">
              <p className="eyebrow">今日の店舗状況</p>
              <h2>{dashboard.headline}</h2>
              <p>{dashboard.summary}</p>
              <div className="command-recommendation"><span aria-hidden="true">✦</span><div><strong>次の一手</strong><p>{dashboard.recommendation}</p></div></div>
              <small>確認時点: {dashboard.dataAsOf}／実データと接続状態をもとに整理</small>
            </div>
          </section>

          <section className="command-panel command-social-panel">
            <div className="section-heading"><div><p className="eyebrow">SNS・集客</p><h2>確認できる投稿下書き</h2></div><Link className="text-link" href={`/stores/${store.id}/growth-actions`}>すべて見る →</Link></div>
            {dashboard.socialDrafts.length ? (
              <div className="command-social-grid">
                {dashboard.socialDrafts.map((draft) => (
                  <Link className="command-social-card" href={draft.href} key={draft.id}>
                    {draft.imageUrl ? <div className="command-social-image" role="img" aria-label={`${draft.title}の投稿画像`} style={{ backgroundImage: `url(${draft.imageUrl})` }} /> : <div className="command-social-image placeholder"><span>{draft.channel}</span></div>}
                    <div><span>{draft.channel}</span><strong>{draft.title}</strong><p>{draft.summary}</p></div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="command-empty-state"><strong>投稿下書きはまだありません</strong><p>写真や店舗情報から、確認してから公開できるSNS下書きを作成できます。</p><Link className="button secondary" href={`/stores/${store.id}/growth-actions`}>集客提案を確認する</Link></div>
            )}
          </section>
        </section>

        <aside className="command-task-column">
          <section className="command-panel">
            <div className="section-heading"><div><p className="eyebrow">優先順</p><h2>今日やること</h2></div><span className="badge">{dashboard.tasks.length}件</span></div>
            <div className="command-task-list">
              {dashboard.tasks.map((task) => (
                <article className={`command-task ${task.tone}`} key={task.key}>
                  <span>{task.category}</span>
                  <h3>{task.title}</h3>
                  <p>{task.detail}</p>
                  <Link className="button" href={task.href}>{task.actionLabel}</Link>
                </article>
              ))}
            </div>
          </section>
          <section className="command-panel command-alert-summary">
            {dashboard.enabledAreas.inventory ? <div><span>在庫アラート</span><strong>{dashboard.inventoryLowCount ? `${dashboard.inventoryLowCount}件` : "なし"}</strong><Link href={`/stores/${store.id}/inventory`}>在庫を見る →</Link></div> : null}
            <div><span>口コミ未返信</span><strong>{dashboard.unansweredReviewCount ? `${dashboard.unansweredReviewCount}件` : "なし"}</strong><Link href={`/stores/${store.id}/reviews`}>口コミを見る →</Link></div>
          </section>
        </aside>
      </div>

      <section className="command-shortcuts">
        <p className="eyebrow">よく使う機能</p>
        <div>
          {dashboard.enabledAreas.sales ? <Link href={`/stores/${store.id}/sales-hub`}><strong>売上・レポート</strong><span>売上と書類を確認</span></Link> : null}
          {dashboard.enabledAreas.inventory ? <Link href={`/stores/${store.id}/inventory`}><strong>{dashboard.industryName === "飲食店" ? "食材・仕入" : "在庫・仕入"}</strong><span>在庫と発注を確認</span></Link> : null}
          {dashboard.enabledAreas.customers ? <Link href={`/stores/${store.id}/customers`}><strong>顧客</strong><span>顧客情報を確認</span></Link> : null}
          <Link href={`/stores/${store.id}/reviews`}><strong>Google口コミ</strong><span>返信状況を確認</span></Link>
          <Link href={`/stores/${store.id}/items`}><strong>メニュー・商品</strong><span>提供内容を編集</span></Link>
          <Link href={`/stores/${store.id}/settings`}><strong>設定・連携</strong><span>外部サービスを確認</span></Link>
        </div>
      </section>
    </div>
  );
}
