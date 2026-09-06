import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { BookingForm } from "@/components/bookings/booking-form";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { listBookingResources, listBookingServices, requireBooking } from "@/lib/bookings";
import { toJapanDateTimeLocal } from "@/lib/bookings/rules";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { archiveBookingAction, restoreBookingAction, updateBookingAction } from "../actions";
import { canEditStore } from "@/lib/auth/server";
import { bookingSourceLabels, bookingStatusLabels } from "@/lib/bookings/constants";

export default async function BookingDetailPage({ params, searchParams }: { params: Promise<{ storeId: string; bookingId: string }>; searchParams: Promise<{ saved?: string; restored?: string; deleted?: string; error?: string }> }) {
  const { storeId, bookingId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const editable = await canEditStore(store.id, store.organization_id);
  const includeArchived = query.deleted === "1";
  const [booking, services, resources, customers] = await Promise.all([
    requireBooking(store.id, bookingId, includeArchived), listBookingServices(store.id), listBookingResources(store.id), listCustomers(store.id, 2000)
  ]);
  return <AppShell>
    <PageHeader eyebrow="予約" title={`${booking.customer_name}様の予約`} description="予約内容、日時、担当・設備、状態を確認できます。" action={<Link className="button secondary" href={`/stores/${store.id}/bookings${includeArchived ? "?view=deleted" : ""}`}>予約一覧へ戻る</Link>} />
    {query.saved ? <p className="notice success">予約の変更を保存しました。</p> : null}
    {query.restored ? <p className="notice success">削除済みの予約を元に戻しました。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
    {!editable ? <section className="card"><div className="grid cols-2"><div><p className="muted">日時</p><strong>{new Date(booking.starts_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 〜 {new Date(booking.ends_at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}</strong></div><div><p className="muted">状態・受付</p><strong>{bookingStatusLabels[booking.status]}・{bookingSourceLabels[booking.source]}</strong></div><div><p className="muted">予約内容</p><strong>{booking.service?.name ?? booking.service_name ?? "未設定"}</strong></div><div><p className="muted">連絡先</p><strong>{booking.customer_phone || booking.customer_email || "未登録"}</strong></div></div><p className="notice">このアカウントは閲覧のみです。変更が必要な場合は店舗管理者へ依頼してください。</p></section> : booking.archived_at ? <section className="card"><h2>削除済みの予約です</h2><p>内容を確認し、必要なら元に戻せます。重複がある場合は復元できません。</p><form action={restoreBookingAction.bind(null, store.id, booking.id)}><ConfirmSubmitButton className="button" message="この予約を元に戻しますか？">元に戻す</ConfirmSubmitButton></form></section> : <>
      <BookingForm action={updateBookingAction.bind(null, store.id, booking.id)} booking={booking} services={services} resources={resources} customers={customers} initialStartsAt={toJapanDateTimeLocal(booking.starts_at)} initialEndsAt={toJapanDateTimeLocal(booking.ends_at)} cancelHref={`/stores/${store.id}/bookings`} />
      <form className="danger-zone" action={archiveBookingAction.bind(null, store.id, booking.id)}><ConfirmSubmitButton message={`${booking.customer_name}様の予約を削除します。削除済みから元に戻せます。`}>予約を削除</ConfirmSubmitButton></form>
    </>}
  </AppShell>;
}
