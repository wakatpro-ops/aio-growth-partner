import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getResultsVisibilityWorkspace } from "@/lib/results-visibility";
import { getStore } from "@/lib/stores";
import { restoreAiVisibilityQuestionAction, restoreSearchVisibilityKeywordAction } from "../actions";

export default async function DeletedResultsKeywordsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ error?: string; restored?: string; aiRestored?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const workspace = await getResultsVisibilityWorkspace(store.id);
  return <AppShell>
    <PageHeader eyebrow="成果を見る" title="削除済みキーワード" description="計測履歴を残したまま、監視対象から外した検索キーワードです。" />
    <StoreBusinessNav store={store} />
    <Link className="back-link" href={`/stores/${store.id}/results`}>← 成果画面へ戻る</Link>
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
    {query.restored ? <p className="notice success">検索キーワードを元に戻しました。</p> : null}
    {query.aiRestored ? <p className="notice success">AI定点観測の質問を元に戻しました。</p> : null}
    <section className="card"><table className="table"><thead><tr><th>検索キーワード</th><th>削除日時</th><th>操作</th></tr></thead><tbody>
      {workspace.archivedKeywords.map((keyword) => <tr key={keyword.id}><td><strong>{keyword.keyword}</strong></td><td>{keyword.archived_at ? new Date(keyword.archived_at).toLocaleString("ja-JP") : "-"}</td><td><form action={restoreSearchVisibilityKeywordAction.bind(null, store.id, keyword.id)}><PendingSubmitButton pendingLabel="元に戻しています...">元に戻す</PendingSubmitButton></form></td></tr>)}
      {workspace.archivedKeywords.length === 0 ? <tr><td colSpan={3}>削除済みの検索キーワードはありません。</td></tr> : null}
    </tbody></table></section>
    <section className="card"><div className="section-heading"><div><p className="eyebrow">AIでの見つかり方</p><h2>削除済みの質問</h2></div></div><table className="table"><thead><tr><th>質問</th><th>削除日時</th><th>操作</th></tr></thead><tbody>
      {workspace.archivedAiQuestions.map((question) => <tr key={question.id}><td><strong>{question.question}</strong><br /><span className="muted">{question.frequency_days}日ごと</span></td><td>{question.archived_at ? new Date(question.archived_at).toLocaleString("ja-JP") : "-"}</td><td><form action={restoreAiVisibilityQuestionAction.bind(null, store.id, question.id)}><PendingSubmitButton pendingLabel="元に戻しています...">元に戻す</PendingSubmitButton></form></td></tr>)}
      {workspace.archivedAiQuestions.length === 0 ? <tr><td colSpan={3}>削除済みのAI定点観測質問はありません。</td></tr> : null}
    </tbody></table></section>
  </AppShell>;
}
