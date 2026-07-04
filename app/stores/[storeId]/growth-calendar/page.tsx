import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { growthActionChannelLabel, growthActionStatusLabel, listGrowthCalendarItems } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import type { GrowthActionScheduleItem } from "@/types/phase5";

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function channelClass(channel: string) {
  return `channel-${channel.replaceAll("_", "-")}`;
}

function itemCard(storeId: string, item: GrowthActionScheduleItem) {
  return (
    <article className={`calendar-item ${channelClass(item.channel)}`} key={item.id}>
      <div className="calendar-item-head">
        <span className="badge">{growthActionChannelLabel(item.channel)}</span>
        <span className="muted">{growthActionStatusLabel(item.status)}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.scheduled_date}</p>
      <Link className="button secondary" href={`/stores/${storeId}/growth-actions/${item.growth_action_id}`}>詳細</Link>
    </article>
  );
}

export default async function GrowthCalendarPage({
  params
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "growth_calendar")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const items = await listGrowthCalendarItems(store.id);
  const today = ymd(new Date());
  const weekEnd = ymd(addDays(new Date(), 7));
  const todayItems = items.filter((item) => item.scheduled_date === today);
  const weekItems = items.filter((item) => item.scheduled_date >= today && item.scheduled_date <= weekEnd);
  const waitingItems = items.filter((item) => item.status === "pending_approval");
  const doneItems = items.filter((item) => item.status === "done");
  const pausedItems = items.filter((item) => item.status === "paused");

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="集客カレンダー" description="投稿、配信、返信、POP作成の予定を日付ごとに確認します。" />
      <StoreBusinessNav store={store} />

      <section className="grid cols-4 report-metrics">
        <article className="card"><p className="muted">今日やること</p><div className="metric">{todayItems.length}</div></article>
        <article className="card"><p className="muted">今週やること</p><div className="metric">{weekItems.length}</div></article>
        <article className="card"><p className="muted">承認待ち</p><div className="metric">{waitingItems.length}</div></article>
        <article className="card"><p className="muted">実行済み / 保留</p><div className="metric">{doneItems.length} / {pausedItems.length}</div></article>
      </section>

      <section className="card">
        <h2>日別</h2>
        <div className="calendar-grid">
          {todayItems.length > 0 ? todayItems.map((item) => itemCard(store.id, item)) : <p>今日の予定はありません。</p>}
        </div>
      </section>

      <section className="card">
        <h2>今週</h2>
        <div className="calendar-grid">
          {weekItems.length > 0 ? weekItems.map((item) => itemCard(store.id, item)) : <p>今週の予定はありません。</p>}
        </div>
      </section>

      <section className="card">
        <h2>月別一覧</h2>
        <table className="table">
          <thead><tr><th>日付</th><th>チャネル</th><th>タイトル</th><th>状態</th><th>外部連携</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.scheduled_date}</td>
                <td><span className="badge">{growthActionChannelLabel(item.channel)}</span></td>
                <td>{item.title}</td>
                <td>{growthActionStatusLabel(item.status)}</td>
                <td>{item.external_status ?? "not_connected"}</td>
                <td><Link href={`/stores/${store.id}/growth-actions/${item.growth_action_id}`}>詳細</Link></td>
              </tr>
            ))}
            {items.length === 0 ? <tr><td colSpan={6}>まだ予定がありません。集客アクションセンターで下書きを生成してください。</td></tr> : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
