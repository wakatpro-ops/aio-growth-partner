import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { bookingResourceTypeLabels } from "@/lib/bookings/constants";
import { listBookingResources, listBookingServices } from "@/lib/bookings";
import { listBusinessItems } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import {
  archiveBookingConfigurationAction,
  createBookingResourceAction,
  createBookingServiceAction,
  restoreBookingConfigurationAction,
  updateBookingResourceAction,
  updateBookingServiceAction
} from "../actions";
import { canEditStore } from "@/lib/auth/server";
import { notFound } from "next/navigation";

export default async function BookingSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string; deleted?: string; restored?: string; error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) notFound();
  const [services, resources, items] = await Promise.all([listBookingServices(store.id, true), listBookingResources(store.id, true), listBusinessItems(store.id)]);
  const activeServices = services.filter((service) => !service.archived_at);
  const activeResources = resources.filter((resource) => !resource.archived_at);
  const archivedServices = services.filter((service) => service.archived_at);
  const archivedResources = resources.filter((resource) => resource.archived_at);
  const serviceItems = items.filter((item) => item.item_type === "service");

  return <AppShell>
    <PageHeader eyebrow="予約" title="予約内容・担当・設備" description="所要時間と、同じ時間に重ねて予約できない担当者・席・部屋・設備を設定します。" action={<div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/bookings`}>予約へ戻る</Link><Link className="button secondary" href={`/stores/${store.id}/bookings/line`}>LINE予約</Link></div>} />
    {query.saved ? <p className="notice success">予約設定を保存しました。</p> : null}
    {query.deleted ? <p className="notice success">予約設定を削除しました。下の削除済み設定から元に戻せます。</p> : null}
    {query.restored ? <p className="notice success">予約設定を元に戻しました。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

    <section className="booking-settings-grid">
      <article className="card">
        <div className="section-heading"><div><p className="eyebrow">予約内容</p><h2>新しく追加</h2></div></div>
        <form className="form" action={createBookingServiceAction.bind(null, store.id)}>
          <div className="field"><label htmlFor="new_service_name">名称 <span className="required-mark">必須</span></label><input id="new_service_name" name="name" placeholder="例：カット＋カラー" required /></div>
          <div className="grid cols-2">
            <div className="field"><label htmlFor="new_service_duration">所要時間（分）</label><input id="new_service_duration" name="duration_minutes" type="number" min="5" max="1440" step="5" defaultValue="60" /></div>
            <div className="field"><label htmlFor="new_service_price">料金</label><input id="new_service_price" name="price" type="number" min="0" step="1" defaultValue="0" /></div>
            <div className="field"><label htmlFor="new_service_before">前の準備（分）</label><input id="new_service_before" name="buffer_before_minutes" type="number" min="0" max="360" step="5" defaultValue="0" /></div>
            <div className="field"><label htmlFor="new_service_after">後の片付け（分）</label><input id="new_service_after" name="buffer_after_minutes" type="number" min="0" max="360" step="5" defaultValue="0" /></div>
            <div className="field"><label htmlFor="new_service_item">メニューと関連付け</label><select id="new_service_item" name="item_id"><option value="">関連付けない</option>{serviceItems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
            <div className="field"><label htmlFor="new_service_color">表示色</label><input id="new_service_color" name="color" type="color" defaultValue="#248565" /></div>
          </div>
          <input name="sort_order" type="hidden" value="0" />
          <label className="check-row"><input name="is_bookable" type="checkbox" defaultChecked />予約時に選べる</label>
          <div className="field"><label htmlFor="new_service_description">説明</label><textarea id="new_service_description" name="description" /></div>
          <PendingSubmitButton pendingLabel="予約内容を追加しています...">予約内容を追加</PendingSubmitButton>
        </form>
      </article>

      <article className="card">
        <div className="section-heading"><div><p className="eyebrow">担当・設備</p><h2>新しく追加</h2></div></div>
        <form className="form" action={createBookingResourceAction.bind(null, store.id)}>
          <div className="field"><label htmlFor="new_resource_name">名称 <span className="required-mark">必須</span></label><input id="new_resource_name" name="name" placeholder="例：木村／個室A／施術ベッド1" required /></div>
          <div className="grid cols-2">
            <div className="field"><label htmlFor="new_resource_type">種別</label><select id="new_resource_type" name="resource_type">{Object.entries(bookingResourceTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <div className="field"><label htmlFor="new_resource_capacity">同時受付数</label><input id="new_resource_capacity" name="capacity" type="number" min="1" max="100" defaultValue="1" /></div>
            <div className="field"><label htmlFor="new_resource_color">表示色</label><input id="new_resource_color" name="color" type="color" defaultValue="#5478d4" /></div>
          </div>
          <input name="sort_order" type="hidden" value="0" />
          <label className="check-row"><input name="is_bookable" type="checkbox" defaultChecked />予約時に選べる</label>
          <PendingSubmitButton pendingLabel="担当・設備を追加しています...">担当・設備を追加</PendingSubmitButton>
        </form>
      </article>
    </section>

    <section className="card booking-config-list">
      <div className="section-heading"><div><p className="eyebrow">現在の設定</p><h2>予約内容</h2></div><span className="badge">{activeServices.length}件</span></div>
      {activeServices.map((service) => <article className="booking-config-row" key={service.id}>
        <details><summary><span className="booking-color" style={{ backgroundColor: service.color }} /><strong>{service.name}</strong><small>{service.duration_minutes}分・{Number(service.price).toLocaleString("ja-JP")}円</small></summary>
          <form className="form booking-config-form" action={updateBookingServiceAction.bind(null, store.id, service.id)}>
            <div className="grid cols-3"><div className="field"><label>名称</label><input name="name" defaultValue={service.name} required /></div><div className="field"><label>所要時間（分）</label><input name="duration_minutes" type="number" min="5" max="1440" step="5" defaultValue={service.duration_minutes} /></div><div className="field"><label>料金</label><input name="price" type="number" min="0" defaultValue={service.price} /></div><div className="field"><label>前の準備（分）</label><input name="buffer_before_minutes" type="number" min="0" max="360" defaultValue={service.buffer_before_minutes} /></div><div className="field"><label>後の片付け（分）</label><input name="buffer_after_minutes" type="number" min="0" max="360" defaultValue={service.buffer_after_minutes} /></div><div className="field"><label>表示色</label><input name="color" type="color" defaultValue={service.color} /></div><div className="field"><label>メニューと関連付け</label><select name="item_id" defaultValue={service.item_id ?? ""}><option value="">関連付けない</option>{serviceItems.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div><div className="field"><label>表示順</label><input name="sort_order" type="number" min="0" max="9999" defaultValue={service.sort_order} /></div></div>
            <label className="check-row"><input name="is_bookable" type="checkbox" defaultChecked={service.is_bookable} />予約時に選べる</label><div className="field"><label>説明</label><textarea name="description" defaultValue={service.description ?? ""} /></div><PendingSubmitButton pendingLabel="変更を保存しています...">変更を保存</PendingSubmitButton>
          </form>
        </details>
        <form action={archiveBookingConfigurationAction.bind(null, store.id, "service", service.id)}><ConfirmSubmitButton message={`「${service.name}」を削除します。過去の予約は保持されます。`}>削除</ConfirmSubmitButton></form>
      </article>)}
      {activeServices.length === 0 ? <p>予約内容はまだありません。上のフォームから最初のメニューを登録してください。</p> : null}
    </section>

    <section className="card booking-config-list">
      <div className="section-heading"><div><p className="eyebrow">現在の設定</p><h2>担当・設備</h2></div><span className="badge">{activeResources.length}件</span></div>
      {activeResources.map((resource) => <article className="booking-config-row" key={resource.id}>
        <details><summary><span className="booking-color" style={{ backgroundColor: resource.color }} /><strong>{resource.name}</strong><small>{bookingResourceTypeLabels[resource.resource_type]}・同時{resource.capacity}件</small></summary>
          <form className="form booking-config-form" action={updateBookingResourceAction.bind(null, store.id, resource.id)}>
            <div className="grid cols-3"><div className="field"><label>名称</label><input name="name" defaultValue={resource.name} required /></div><div className="field"><label>種別</label><select name="resource_type" defaultValue={resource.resource_type}>{Object.entries(bookingResourceTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="field"><label>同時受付数</label><input name="capacity" type="number" min="1" max="100" defaultValue={resource.capacity} /></div><div className="field"><label>表示色</label><input name="color" type="color" defaultValue={resource.color} /></div><div className="field"><label>表示順</label><input name="sort_order" type="number" min="0" max="9999" defaultValue={resource.sort_order} /></div></div>
            <label className="check-row"><input name="is_bookable" type="checkbox" defaultChecked={resource.is_bookable} />予約時に選べる</label><PendingSubmitButton pendingLabel="変更を保存しています...">変更を保存</PendingSubmitButton>
          </form>
        </details>
        <form action={archiveBookingConfigurationAction.bind(null, store.id, "resource", resource.id)}><ConfirmSubmitButton message={`「${resource.name}」を削除します。過去の予約は保持されます。`}>削除</ConfirmSubmitButton></form>
      </article>)}
      {activeResources.length === 0 ? <p>担当・設備はまだありません。上のフォームから登録すると時間重複を防げます。</p> : null}
    </section>

    {(archivedServices.length || archivedResources.length) ? <section className="card booking-config-list"><div className="section-heading"><div><p className="eyebrow">削除済み</p><h2>元に戻せる設定</h2></div></div>
      {[...archivedServices.map((item) => ({ ...item, kind: "service" as const })), ...archivedResources.map((item) => ({ ...item, kind: "resource" as const }))].map((item) => <div className="booking-config-row" key={`${item.kind}-${item.id}`}><div><strong>{item.name}</strong><small>{item.kind === "service" ? "予約内容" : "担当・設備"}</small></div><form action={restoreBookingConfigurationAction.bind(null, store.id, item.kind, item.id)}><ConfirmSubmitButton className="button secondary" message={`「${item.name}」を元に戻しますか？`}>元に戻す</ConfirmSubmitButton></form></div>)}
    </section> : null}
  </AppShell>;
}
