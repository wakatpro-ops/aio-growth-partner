import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getAioImprovementWorkspace } from "@/lib/aio-improvement";
import { archiveStoreEntityAction } from "../archive-actions";
import { runAioRediagnosisAction, saveAioGoalAction, startAioImprovementTaskAction } from "./actions";

const taskStatusLabels = {
  not_started: "未着手",
  in_progress: "対応中",
  completed: "完了",
  on_hold: "保留"
} as const;

const publicationLabels = {
  not_published: "未公開",
  pending_review: "公開確認待ち",
  verified: "公開確認済み"
} as const;

export default async function AioImprovementPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; goalSaved?: string; rediagnosed?: string; archived?: string; setup?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const workspace = await getAioImprovementWorkspace(storeId);
  const { store, readiness, tasks, snapshots, activeTask, alerts } = workspace;
  const industry = getIndustryConfig(store.industry_type_key);
  const priority = readiness.nextBestActions[0];
  const lastSnapshot = snapshots[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="AIO改善"
        title="見つけてもらうための改善を続ける"
        description="準備度、改善実行、外部公開の確認、再診断を一つの流れで管理します。外部AIの推薦や順位を保証するものではありません。"
        action={<Link className="button secondary" href={`/stores/${store.id}/aio-improvement/history`}>改善履歴を見る</Link>}
      />
      <StoreBusinessNav store={store} />
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      {query.goalSaved ? <p className="notice success">目指す質問を保存しました。次の改善提案に反映されます。</p> : null}
      {query.rediagnosed ? <p className="notice success">現在の情報で再診断し、履歴を保存しました。</p> : null}
      {query.archived ? <p className="notice success">改善項目を削除しました。削除済みデータから元に戻せます。</p> : null}
      {query.setup === "completed" ? <p className="notice success">初期設定を反映しました。店舗情報、請求書設定、選択したメニューを利用できます。まず最初のAIO改善を1件だけ進めましょう。</p> : null}

      <section className="aio-cycle-hero">
        <article>
          <p className="eyebrow">AIおすすめ準備度</p>
          <div className="aio-score-line"><strong>{readiness.score}%</strong><span>{readiness.stage}</span></div>
          <p>{readiness.headline}</p>
          <div className="readiness-meter" aria-label={`AIおすすめ準備度 ${readiness.score}%`}><span style={{ width: `${readiness.score}%` }} /></div>
        </article>
        <article>
          <p className="eyebrow">外部への反映状況</p>
          <div className="status-list">
            <span><b>Google連携</b><em>{readiness.publicationStatus.googleConnected ? "接続・URL確認済み" : "未確認"}</em></span>
            <span><b>改善コンテンツ</b><em>{readiness.publicationStatus.contentCreated ? "下書きあり" : "未作成"}</em></span>
          </div>
          <p className="muted">準備度と公開状況は別に判定します。準備度が上がっても、公開確認が終わるまでは反映完了ではありません。</p>
        </article>
      </section>

      <section className="card" id="questions">
        <div className="section-heading">
          <div><p className="eyebrow">お客様の質問から逆算</p><h2>どんな質問で見つけてもらいたいですか？</h2></div>
          <span className="badge">1〜3件</span>
        </div>
        <p>地域、目的、悩みを含む自然な質問を登録します。例：「鎌倉であんみつを食べるならどこがいい？」</p>
        <form className="form" action={saveAioGoalAction.bind(null, store.id)}>
          <div className="grid cols-3">
            {[0, 1, 2].map((index) => (
              <div className="field" key={index}>
                <label htmlFor={`target_question_${index + 1}`}>目標質問 {index + 1}{index === 0 ? <span className="required-mark"> 必須</span> : null}</label>
                <textarea id={`target_question_${index + 1}`} name={`target_question_${index + 1}`} defaultValue={readiness.targetQuestions[index] ?? ""} maxLength={160} required={index === 0} />
              </div>
            ))}
          </div>
          <div className="form-actions">
            <PendingSubmitButton pendingLabel="目標質問を保存しています...">目標質問を保存</PendingSubmitButton>
            <Link className="button secondary" href={`/stores/${store.id}`}>店舗トップへ戻る</Link>
          </div>
        </form>
      </section>

      {alerts.length > 0 ? (
        <section className="card">
          <div className="section-heading"><div><p className="eyebrow">確認が必要</p><h2>古い・未公開・期限超過を見逃さない</h2></div><span className="badge priority-high">{alerts.length}件</span></div>
          <div className="aio-alert-list">
            {alerts.map((alert) => (
              <Link className={`aio-alert ${alert.tone}`} href={alert.href} key={alert.key}>
                <div><strong>{alert.title}</strong><p>{alert.message}</p></div><span>確認する →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card first-priority-card" id="priority">
        <div className="section-heading">
          <div><p className="eyebrow">今やる改善は1件だけ</p><h2>{activeTask?.title ?? priority?.label ?? "外部への反映を確認"}</h2></div>
          <span className="badge priority-high">最優先</span>
        </div>
        <p>{activeTask?.description ?? priority?.benefit ?? "整えた内容をGoogle・Web・SNSへ反映できる状態にします。"}</p>
        {activeTask ? (
          <div className="aio-current-task">
            <div><span>進捗</span><strong>{taskStatusLabels[activeTask.status]}</strong></div>
            <div><span>担当者</span><strong>{activeTask.assignee_name ?? "未設定"}</strong></div>
            <div><span>期限</span><strong>{activeTask.due_date ?? "未設定"}</strong></div>
            <div><span>公開</span><strong>{publicationLabels[activeTask.publication_status]}</strong></div>
          </div>
        ) : null}
        <div className="form-actions">
          {activeTask ? (
            <Link className="button" href={`/stores/${store.id}/aio-improvement/tasks/${activeTask.id}`}>この改善を続ける</Link>
          ) : priority ? (
            <form action={startAioImprovementTaskAction.bind(null, store.id, priority.key)}>
              <PendingSubmitButton pendingLabel="改善計画を作成しています...">この改善に着手する</PendingSubmitButton>
            </form>
          ) : (
            <Link className="button" href={`/stores/${store.id}/acquisition`}>公開状況を確認する</Link>
          )}
          <Link className="button secondary" href={activeTask?.source_href ?? priority?.href ?? `/stores/${store.id}/settings/profile`}>元の情報を確認する</Link>
        </div>
      </section>

      <section className="card" id="rediagnosis">
        <div className="section-heading">
          <div><p className="eyebrow">月次の改善サイクル</p><h2>現在の情報でもう一度診断</h2></div>
          <span className="badge">{workspace.monthlyReviewDue ? "今月の確認が必要" : "今月は確認済み"}</span>
        </div>
        <p>{lastSnapshot ? `前回は${new Date(lastSnapshot.created_at).toLocaleDateString("ja-JP")}に${lastSnapshot.score}%として記録しました。` : "まだ再診断履歴がありません。最初の状態を記録しましょう。"}</p>
        <p className="muted">現在の店舗情報、提供サービス、公式URL、外部反映状況を再計算し、次に行う改善を1件に絞ります。</p>
        <form action={runAioRediagnosisAction.bind(null, store.id)}>
          <PendingSubmitButton pendingLabel="現在の情報を再診断しています...">現在の情報で再診断する</PendingSubmitButton>
        </form>
      </section>

      <section className="card">
        <div className="section-heading"><div><p className="eyebrow">改善項目</p><h2>進捗と公開確認</h2></div><span className="badge">{tasks.length}件</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>改善内容</th><th>進捗</th><th>担当・期限</th><th>公開確認</th><th>操作</th></tr></thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td><strong>{task.title}</strong><br /><span className="muted">開始時 {task.before_score ?? "-"}% → 完了時 {task.after_score ?? "-"}%</span></td>
                  <td><span className="badge">{taskStatusLabels[task.status]}</span></td>
                  <td>{task.assignee_name ?? "未設定"}<br /><span className="muted">{task.due_date ?? "期限未設定"}</span></td>
                  <td>{publicationLabels[task.publication_status]}</td>
                  <td><div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/aio-improvement/tasks/${task.id}`}>進捗を更新</Link><form action={archiveStoreEntityAction.bind(null, store.id, "aio_improvement_task", task.id, `/stores/${store.id}/aio-improvement`)}><ConfirmSubmitButton message={`「${task.title}」を削除済みに移します。履歴は保持され、あとで元に戻せます。`}>削除</ConfirmSubmitButton></form></div></td>
                </tr>
              ))}
              {tasks.length === 0 ? <tr><td colSpan={5}>改善項目はまだありません。上の「この改善に着手する」から最初の1件を始めてください。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>準備度の内訳</h2>
        <ol className="progress-list">
          {readiness.items.map((item) => (
            <li className={item.complete ? "done" : ""} key={item.key}>
              <span>{item.complete ? "✓" : ""}</span>
              <div><strong>{item.label}</strong><p>{item.value}</p></div>
              <Link href={item.href}>{item.complete ? "内容を確認" : "情報を改善"} →</Link>
            </li>
          ))}
        </ol>
        <p className="muted">{industry.name}の店舗情報をAIが参照・説明しやすくするための準備状況です。特定サービスでの掲載順位や推薦を示すものではありません。</p>
      </section>
    </AppShell>
  );
}
