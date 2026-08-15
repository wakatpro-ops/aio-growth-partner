import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getAioImprovementWorkspace } from "@/lib/aio-improvement";

const triggerLabels: Record<string, string> = {
  initial: "初回診断",
  manual: "手動再診断",
  monthly: "月次再診断",
  task_completed: "改善完了"
};

export default async function AioImprovementHistoryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store, snapshots, tasks } = await getAioImprovementWorkspace(storeId);

  return (
    <AppShell>
      <PageHeader
        eyebrow="AIO改善"
        title="改善前後と再診断の履歴"
        description="準備度の変化、完了した内容、外部公開の確認を時系列で振り返れます。"
        action={<Link className="button secondary" href={`/stores/${store.id}/aio-improvement`}>AIO改善へ戻る</Link>}
      />
      <StoreBusinessNav store={store} />

      <section className="card">
        <h2>準備度の記録</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>記録日時</th><th>きっかけ</th><th>準備度</th><th>次の改善</th><th>外部反映</th></tr></thead>
            <tbody>
              {snapshots.map((snapshot, index) => {
                const previous = snapshots[index + 1];
                const delta = previous ? snapshot.score - previous.score : null;
                return (
                  <tr key={snapshot.id}>
                    <td>{new Date(snapshot.created_at).toLocaleString("ja-JP")}</td>
                    <td><span className="badge">{triggerLabels[snapshot.trigger_type] ?? snapshot.trigger_type}</span></td>
                    <td><strong>{snapshot.score}%</strong>{delta === null ? null : <span className="muted">（{delta >= 0 ? "+" : ""}{delta}）</span>}</td>
                    <td>{snapshot.next_action_label ?? "公開状況を確認"}</td>
                    <td>{snapshot.publication_status.googleConnected ? "Google確認あり" : "Google未確認"}／{snapshot.publication_status.contentCreated ? "下書きあり" : "下書きなし"}</td>
                  </tr>
                );
              })}
              {snapshots.length === 0 ? <tr><td colSpan={5}>再診断履歴はまだありません。AIO改善画面から現在の状態を記録してください。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>改善内容の履歴</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>改善内容</th><th>状態</th><th>準備度</th><th>変更内容</th><th>公開確認</th></tr></thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td><Link className="text-link" href={`/stores/${store.id}/aio-improvement/tasks/${task.id}`}>{task.title}</Link></td>
                  <td>{task.status === "completed" ? "完了" : task.status === "in_progress" ? "対応中" : task.status === "on_hold" ? "保留" : "未着手"}</td>
                  <td>{task.before_score ?? "-"}% → {task.after_score ?? "-"}%</td>
                  <td>{task.change_summary ?? "未記録"}</td>
                  <td>{task.publication_status === "verified" ? `確認済み（${task.publication_target}）` : task.publication_status === "pending_review" ? "確認待ち" : "未公開"}</td>
                </tr>
              ))}
              {tasks.length === 0 ? <tr><td colSpan={5}>改善内容の履歴はまだありません。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
