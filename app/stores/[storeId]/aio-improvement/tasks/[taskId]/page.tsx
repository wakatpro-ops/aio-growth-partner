import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getAioImprovementTask } from "@/lib/aio-improvement";
import { getStore } from "@/lib/stores";
import { archiveStoreEntityAction } from "../../../archive-actions";
import { updateAioImprovementTaskAction } from "../../actions";

const publicationTargetLabels: Record<string, string> = {
  none: "まだ公開しない",
  website: "公式Webサイト",
  google: "Googleビジネスプロフィール",
  instagram: "Instagram",
  facebook: "Facebook",
  other: "その他"
};

export default async function AioImprovementTaskPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; taskId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; started?: string }>;
}) {
  const { storeId, taskId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const task = await getAioImprovementTask(store.id, taskId);
  if (!task) notFound();

  return (
    <AppShell>
      <PageHeader
        eyebrow="AIO改善"
        title={task.title}
        description="進捗、担当者、期限、変更内容、外部への公開確認を記録します。"
        action={<Link className="button secondary" href={`/stores/${store.id}/aio-improvement`}>AIO改善へ戻る</Link>}
      />
      <StoreBusinessNav store={store} />
      {query.started ? <p className="notice success">改善項目を開始しました。担当者と期限を確認してください。</p> : null}
      {query.saved ? <p className="notice success">進捗と公開確認を保存しました。次に必要な操作を下で確認できます。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

      <section className="grid cols-3">
        <article className="static-card"><span>開始時の準備度</span><strong>{task.before_score ?? "-"}%</strong><p>{task.before_value ?? "記録なし"}</p></article>
        <article className="static-card"><span>完了時の準備度</span><strong>{task.after_score ?? "-"}%</strong><p>{task.after_value ?? "完了時に記録します"}</p></article>
        <article className="static-card"><span>公開先</span><strong>{publicationTargetLabels[task.publication_target] ?? task.publication_target}</strong><p>{task.publication_status === "verified" ? "公開確認済み" : task.publication_status === "pending_review" ? "公開確認待ち" : "未公開"}</p></article>
      </section>

      <form className="card form" action={updateAioImprovementTaskAction.bind(null, store.id, task.id)}>
        <section className="subsection">
          <h2>1. 改善の進捗</h2>
          <div className="grid cols-3">
            <div className="field">
              <label htmlFor="status">進捗状態</label>
              <select id="status" name="status" defaultValue={task.status}>
                <option value="not_started">未着手</option>
                <option value="in_progress">対応中</option>
                <option value="completed">完了</option>
                <option value="on_hold">保留</option>
              </select>
            </div>
            <div className="field"><label htmlFor="assignee_name">担当者</label><input id="assignee_name" name="assignee_name" defaultValue={task.assignee_name ?? ""} placeholder="例：店長 田中" /></div>
            <div className="field"><label htmlFor="due_date">期限</label><input id="due_date" name="due_date" type="date" defaultValue={task.due_date ?? ""} /></div>
          </div>
          <div className="field">
            <label htmlFor="change_summary">変更した内容</label>
            <textarea id="change_summary" name="change_summary" defaultValue={task.change_summary ?? ""} placeholder="例：サービス説明に対象のお客様、施術の特徴、地域名を追加した" />
            <span className="muted">完了にする場合は必須です。変更前後の説明として履歴に残ります。</span>
          </div>
          <div className="field">
            <label htmlFor="hold_reason">保留理由</label>
            <textarea id="hold_reason" name="hold_reason" defaultValue={task.hold_reason ?? ""} placeholder="保留にする場合は、再開条件や確認待ちの内容を入力" />
          </div>
        </section>

        <section className="subsection">
          <h2>2. 外部への公開確認</h2>
          <p className="notice">改善の完了と外部公開は別です。公開先の画面を人が確認してから「公開確認済み」にしてください。</p>
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="publication_target">公開先</label>
              <select id="publication_target" name="publication_target" defaultValue={task.publication_target}>
                {Object.entries(publicationTargetLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="publication_status">公開確認の状態</label>
              <select id="publication_status" name="publication_status" defaultValue={task.publication_status}>
                <option value="not_published">未公開</option>
                <option value="pending_review">公開したため確認待ち</option>
                <option value="verified">公開画面を確認済み</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="publication_url">確認した公開URL</label>
            <input id="publication_url" name="publication_url" type="url" defaultValue={task.publication_url ?? ""} placeholder="https://..." />
            <span className="muted">「公開確認済み」にする場合は必須です。90日後に再確認をお知らせします。</span>
          </div>
        </section>

        <div className="form-actions">
          <PendingSubmitButton pendingLabel="改善状況を保存しています...">進捗と公開確認を保存</PendingSubmitButton>
          {task.source_href ? <Link className="button secondary" href={task.source_href}>元の情報を編集する</Link> : null}
          <Link className="button secondary" href={`/stores/${store.id}/aio-improvement`}>保存せず戻る</Link>
        </div>
      </form>

      <section className="card danger-zone">
        <h2>この改善項目を削除</h2>
        <p>改善前後の記録は保持したまま、通常の一覧から非表示にします。削除済みデータから元に戻せます。</p>
        <form action={archiveStoreEntityAction.bind(null, store.id, "aio_improvement_task", task.id, `/stores/${store.id}/aio-improvement`)}>
          <ConfirmSubmitButton message={`「${task.title}」を削除済みに移します。改善履歴は保持され、あとで元に戻せます。`}>改善項目を削除</ConfirmSubmitButton>
        </form>
      </section>
    </AppShell>
  );
}
