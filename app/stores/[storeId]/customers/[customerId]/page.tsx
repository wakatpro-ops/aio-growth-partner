import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CustomerForm } from "@/components/phase2/customer-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { listCustomerNotes } from "@/lib/customer-crm";
import { getCustomer } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { canEditStore } from "@/lib/auth/server";
import { listCalendarBookings } from "@/lib/bookings";
import { BookingList } from "@/components/bookings/booking-list";
import { customerWorkLabels, japanDay, shiftDay } from "@/lib/customer-workbench-rules";
import { deleteCustomerAction, updateCustomerAction } from "../../business/actions";
import { archiveStoreEntityAction } from "../../archive-actions";
import { createCustomerNoteAction, updateCustomerNoteAction } from "../customer-actions";

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; customerId: string }>; searchParams: Promise<{ noteSaved?: string; noteUpdated?: string; error?: string; archived?: string }> }) {
  const { storeId, customerId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const customer = await getCustomer(store.id, customerId);
  if (!customer) notFound();

  const industry = getIndustryConfig(store.industry_type_key);
  const notes = await listCustomerNotes(store.id, customer.id);
  const editable = await canEditStore(store.id, store.organization_id);
  const labels = customerWorkLabels(store.industry_type_key);
  const today = japanDay();
  const bookings = await listCalendarBookings(store.id, `${shiftDay(today, -365)}T00:00:00+09:00`, `${shiftDay(today, 90)}T00:00:00+09:00`, customer.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title={customer.name} description={`${industry.businessLabels.customer}の概要・予約・対応履歴を確認できます。`} />
      {query.noteSaved ? <p className="notice success">会話・対応メモを追加しました。</p> : null}
      {query.noteUpdated ? <p className="notice success">会話・対応メモを更新しました。</p> : null}
      {query.archived ? <p className="notice success">会話・対応メモを削除しました。削除済みから元に戻せます。</p> : null}
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      <section className="card"><h2>お客様の概要</h2><dl className="definition-list"><div><dt>連絡先</dt><dd>{customer.phone || "電話未登録"} / {customer.email || "メール未登録"}</dd></div><div><dt>最終{labels.visit}・回数</dt><dd>{customer.last_visit_date ?? "未登録"} / {customer.visit_count ? `${customer.visit_count}回` : "履歴未登録"}</dd></div><div><dt>担当</dt><dd>{customer.assigned_staff_name || "未設定"}</dd></div><div><dt>{labels.memo}</dt><dd>{notes[0]?.follow_up || "次回の対応は未登録です"}</dd></div></dl></section>
      <section className="card"><h2>予約・対応履歴</h2><p>過去1年〜今後90日の紐付いた予約。名前の一致だけでは自動的に紐付けません。</p><BookingList storeId={store.id} bookings={bookings}/></section>
      {editable ? <details className="card"><summary>基本情報を編集する</summary><CustomerForm action={updateCustomerAction.bind(null, store.id, customer.id)} customer={customer} showVehicle={store.industry_type_key === "auto_repair"} cancelHref={`/stores/${store.id}/customers?tab=customers`} /></details> : null}
      <section className="grid cols-2">
        {editable ? <form className="card form" action={createCustomerNoteAction.bind(null, store.id, customer.id)}>
          <h2>会話・対応メモを追加</h2>
          <p>{labels.memo}を時系列で残します。必要な情報だけを記録してください。</p>
          <div className="field"><label htmlFor="body">会話・対応内容</label><textarea id="body" name="body" rows={5} required /></div>
          <div className="field"><label htmlFor="follow_up">次回の対応</label><textarea id="follow_up" name="follow_up" rows={3} /></div>
          <PendingSubmitButton pendingLabel="メモを追加しています...">会話・対応メモを追加</PendingSubmitButton>
        </form> : null}
        <article className="card">
          <h2>再来店フォロー</h2>
          <p>この顧客向けの文章も、個人情報や会話メモをAIへ送らずに作成します。</p>
          {editable ? <a className="button" href={`/stores/${store.id}/customer-messages?customer=${customer.id}`}>この顧客への案内文を作る</a> : null}
          <dl className="definition-list">
            <div><dt>最終来店日</dt><dd>{customer.last_visit_date ?? "未登録"}</dd></div>
            <div><dt>来店回数</dt><dd>{customer.visit_count ?? 0}回</dd></div>
            <div><dt>担当者</dt><dd>{customer.assigned_staff_name ?? "未設定"}</dd></div>
            <div><dt>配信状態</dt><dd>{customer.do_not_contact ? "配信停止" : "送信前に許可を確認"}</dd></div>
          </dl>
        </article>
      </section>
      <section className="card">
        <h2>会話・対応メモ履歴</h2>
        <div className="stack">
          {notes.map((note) => (
            <article className="note-entry" key={note.id}>
              <p className="muted">{new Date(note.created_at).toLocaleString("ja-JP")}</p>
              <p className="customer-note-body">{note.body}</p>{note.follow_up ? <p className="customer-note-body">次回の対応: {note.follow_up}</p> : null}
              {editable ? <details><summary>このメモを編集・削除</summary>
              <form className="form" action={updateCustomerNoteAction.bind(null, store.id, customer.id, note.id)}>
                <div className="field"><label htmlFor={`body-${note.id}`}>会話・対応内容</label><textarea id={`body-${note.id}`} name="body" defaultValue={note.body} rows={3} required /></div>
                <div className="field"><label htmlFor={`follow-${note.id}`}>次回の対応</label><textarea id={`follow-${note.id}`} name="follow_up" defaultValue={note.follow_up ?? ""} rows={2} /></div>
                <PendingSubmitButton className="button secondary" pendingLabel="メモを更新しています...">メモの変更を保存</PendingSubmitButton>
              </form>
              <form action={archiveStoreEntityAction.bind(null, store.id, "customer_note", note.id, `/stores/${store.id}/customers/${customer.id}`)}>
                <ConfirmSubmitButton message="この会話・対応メモを削除します。削除済みから元に戻せます。">メモを削除</ConfirmSubmitButton>
              </form>
              </details> : null}
            </article>
          ))}
          {notes.length === 0 ? <p>会話・対応メモはまだありません。</p> : null}
        </div>
      </section>
      {editable ? <form action={deleteCustomerAction.bind(null, store.id, customer.id)} className="danger-zone">
        <ConfirmSubmitButton message={`「${customer.name}」を削除します。過去の見積・請求との関連は保持され、削除済みデータから元に戻せます。`}>削除</ConfirmSubmitButton>
      </form> : null}
    </AppShell>
  );
}
