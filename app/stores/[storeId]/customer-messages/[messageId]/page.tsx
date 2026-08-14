import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getCustomerMessageDraft } from "@/lib/customer-crm";
import { getStore } from "@/lib/stores";
import { updateCustomerMessageAction } from "../../customers/customer-actions";

function datetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default async function CustomerMessageDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; messageId: string }>; searchParams: Promise<{ created?: string; saved?: string; error?: string }> }) {
  const { storeId, messageId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const draft = await getCustomerMessageDraft(store.id, messageId);
  if (!draft) notFound();

  return (
    <AppShell>
      <PageHeader eyebrow="顧客メッセージ" title={draft.title} description="内容を確認・編集して、必要なら配信予定日時を保存します。" action={<Link className="button secondary" href={`/stores/${store.id}/customer-messages`}>下書き一覧へ戻る</Link>} />
      <StoreBusinessNav store={store} />
      {query.created ? <p className="notice success">AIが下書きを作成しました。まだ外部へ送信されていません。</p> : null}
      {query.saved ? <p className="notice success">メッセージと配信予定を保存しました。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <section className="grid cols-2">
        <form className="card form" action={updateCustomerMessageAction.bind(null, store.id, draft.id)}>
          <div className="field"><label htmlFor="title">件名・タイトル</label><input id="title" name="title" defaultValue={draft.title} required /></div>
          <div className="field"><label htmlFor="body">本文</label><textarea id="body" name="body" rows={12} defaultValue={draft.body} required /></div>
          <div className="field"><label htmlFor="scheduled_at">配信予定日時</label><input id="scheduled_at" name="scheduled_at" type="datetime-local" defaultValue={datetimeLocal(draft.scheduled_at)} /></div>
          <div className="form-actions"><PendingSubmitButton pendingLabel="メッセージを保存しています...">内容と配信予定を保存</PendingSubmitButton><Link className="button secondary" href={`/stores/${store.id}/customer-messages`}>変更せずに戻る</Link></div>
        </form>
        <article className="card">
          <h2>送信前確認</h2>
          <dl className="definition-list">
            <div><dt>対象</dt><dd>{draft.customer?.name ?? `${draft.segment_key}／${draft.audience_count}人`}</dd></div>
            <div><dt>状態</dt><dd>{draft.status === "scheduled" ? "配信予定（未送信）" : "下書き"}</dd></div>
            <div><dt>AIが使った情報</dt><dd>セグメント名、対象人数、媒体、目的</dd></div>
            <div><dt>AIへ送っていない情報</dt><dd>名前、電話番号、メール、SNSアカウント、会話メモ</dd></div>
          </dl>
          <p className="notice">保存しても外部送信されません。配信許可、宛先、日時、本文を確認してから各媒体で送信してください。</p>
          {draft.ai_reasoning ? <><h3>AIの作成意図</h3><p>{draft.ai_reasoning}</p></> : null}
        </article>
      </section>
    </AppShell>
  );
}
