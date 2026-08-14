import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getCustomerSegmentSummaries, listCustomerMessageDrafts } from "@/lib/customer-crm";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { archiveStoreEntityAction } from "../archive-actions";
import { createCustomerMessageAction } from "../customers/customer-actions";

const channelLabels: Record<string, string> = { email: "メール", line: "LINE", instagram: "Instagram", facebook: "Facebook", manual: "その他" };

export default async function CustomerMessagesPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ error?: string; archived?: string; segment?: string; customer?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const [segments, customers, drafts] = await Promise.all([
    getCustomerSegmentSummaries(store.id),
    listCustomers(store.id, 500),
    listCustomerMessageDrafts(store.id)
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="集客・顧客"
        title="顧客メッセージ"
        description="個別またはセグメント向けの文章をAIで作り、人が確認してから配信予定として保存します。"
        action={<Link className="button secondary" href={`/stores/${store.id}/customer-segments`}>セグメントへ戻る</Link>}
      />
      <StoreBusinessNav store={store} />
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      {query.archived ? <p className="notice success">メッセージ下書きを削除しました。削除済みから元に戻せます。</p> : null}
      <p className="notice">この機能は下書きと配信予定を保存します。現在はLINE・SNS・メールを自動送信しません。本文を確認し、各配信先で送信してください。</p>

      <section className="grid cols-2">
        <form className="card form" action={createCustomerMessageAction.bind(null, store.id)}>
          <h2>AIでメッセージ案を作る</h2>
          <div className="field">
            <label htmlFor="customer_id">個別の顧客（任意）</label>
            <select id="customer_id" name="customer_id" defaultValue={query.customer ?? ""}>
              <option value="">セグメント全体の案を作る</option>
              {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}／{customer.phone}</option>)}
            </select>
            <span className="muted">個別を選んでも、名前・電話・会話メモはAIへ送らず、本文には「{`{{名前}}`}」を入れます。</span>
          </div>
          <div className="field">
            <label htmlFor="segment_key">対象セグメント</label>
            <select id="segment_key" name="segment_key" defaultValue={query.segment ?? "inactive_90"}>
              {segments.filter((segment) => segment.key !== "do_not_contact").map((segment) => <option value={segment.key} key={segment.key}>{segment.label}（{segment.count}人）</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="channel">利用する媒体</label>
            <select id="channel" name="channel" defaultValue="line">
              {Object.entries(channelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="goal">伝えたい目的</label>
            <textarea id="goal" name="goal" defaultValue="久しぶりのお客様に、負担にならない形で再来店のきっかけを作る" />
          </div>
          <div className="field">
            <label htmlFor="scheduled_at">配信予定日時（任意）</label>
            <input id="scheduled_at" name="scheduled_at" type="datetime-local" />
          </div>
          <PendingSubmitButton pendingLabel="個人情報を除いた集計から作成しています...">メッセージ下書きを作成</PendingSubmitButton>
        </form>
        <article className="card">
          <h2>安全な使い方</h2>
          <ol className="progress-list">
            <li className="done"><span>1</span><div><strong>対象を選ぶ</strong><p>配信許可と配信停止を確認します。</p></div></li>
            <li className="done"><span>2</span><div><strong>AIが案を作る</strong><p>個人情報ではなく匿名の集計を使います。</p></div></li>
            <li><span>3</span><div><strong>人が確認・修正</strong><p>事実、表現、特典、日時を確認します。</p></div></li>
            <li><span>4</span><div><strong>配信先で送信</strong><p>自動送信連携までは下書きをコピーして使います。</p></div></li>
          </ol>
        </article>
      </section>

      <section className="card">
        <h2>下書き・配信予定</h2>
        <div className="table-wrap"><table><thead><tr><th>件名</th><th>対象</th><th>媒体</th><th>状態</th><th>予定日時</th><th>操作</th></tr></thead><tbody>
          {drafts.map((draft) => (
            <tr key={draft.id}>
              <td>{draft.title}</td>
              <td>{draft.customer?.name ?? `${draft.segment_key}／${draft.audience_count}人`}</td>
              <td>{channelLabels[draft.channel] ?? draft.channel}</td>
              <td><span className="badge">{draft.status === "scheduled" ? "配信予定（未送信）" : "下書き"}</span></td>
              <td>{draft.scheduled_at ? new Date(draft.scheduled_at).toLocaleString("ja-JP") : "未設定"}</td>
              <td><div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/customer-messages/${draft.id}`}>確認・編集</Link><form action={archiveStoreEntityAction.bind(null, store.id, "customer_message", draft.id, `/stores/${store.id}/customer-messages`)}><ConfirmSubmitButton message={`「${draft.title}」を削除します。削除済みから元に戻せます。`}>削除</ConfirmSubmitButton></form></div></td>
            </tr>
          ))}
          {drafts.length === 0 ? <tr><td colSpan={6}>メッセージ下書きはまだありません。</td></tr> : null}
        </tbody></table></div>
      </section>
    </AppShell>
  );
}
