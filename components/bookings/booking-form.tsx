"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { bookingResourceTypeLabels, bookingSourceLabels, bookingStatusLabels } from "@/lib/bookings/constants";
import { toJapanDateTimeLocal } from "@/lib/bookings/rules";
import type { BookingResource, BookingService, StoreBooking } from "@/types/bookings";
import type { Customer } from "@/types/phase2";

function addMinutes(value: string, minutes: number) {
  const parsed = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return toJapanDateTimeLocal(new Date(parsed.getTime() + minutes * 60_000));
}

export function BookingForm({
  action,
  booking,
  services,
  resources,
  customers,
  initialStartsAt,
  initialEndsAt,
  cancelHref
}: {
  action: (formData: FormData) => void | Promise<void>;
  booking?: StoreBooking | null;
  services: BookingService[];
  resources: BookingResource[];
  customers: Customer[];
  initialStartsAt: string;
  initialEndsAt: string;
  cancelHref: string;
}) {
  const currentResourceIds = useMemo(() => new Set((booking?.allocations ?? []).map((allocation) => allocation.resource_id)), [booking]);
  const [customerId, setCustomerId] = useState(booking?.customer_id ?? "");
  const [customerName, setCustomerName] = useState(booking?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(booking?.customer_phone ?? "");
  const [customerEmail, setCustomerEmail] = useState(booking?.customer_email ?? "");
  const [serviceId, setServiceId] = useState(booking?.service_id ?? "");
  const [serviceName, setServiceName] = useState(booking?.service_name ?? "");
  const [startsAt, setStartsAt] = useState(booking ? toJapanDateTimeLocal(booking.starts_at) : initialStartsAt);
  const [endsAt, setEndsAt] = useState(booking ? toJapanDateTimeLocal(booking.ends_at) : initialEndsAt);

  function chooseCustomer(nextId: string) {
    setCustomerId(nextId);
    const selected = customers.find((customer) => customer.id === nextId);
    if (!selected) return;
    setCustomerName(selected.name);
    setCustomerPhone(selected.phone ?? "");
    setCustomerEmail(selected.email ?? "");
  }

  function chooseService(nextId: string) {
    setServiceId(nextId);
    const selected = services.find((service) => service.id === nextId);
    if (!selected) return;
    setServiceName(selected.name);
    setEndsAt(addMinutes(startsAt, selected.duration_minutes));
  }

  function changeStart(nextValue: string) {
    setStartsAt(nextValue);
    const selected = services.find((service) => service.id === serviceId);
    if (selected) setEndsAt(addMinutes(nextValue, selected.duration_minutes));
  }

  return (
    <form className="card form booking-form" action={action}>
      <section className="booking-form-section">
        <div className="section-heading"><div><p className="eyebrow">1. お客様</p><h2>予約する方</h2></div><p>既存顧客を選ぶと連絡先を自動入力します。未登録のお客様も予約できます。</p></div>
        <div className="field">
          <label htmlFor="customer_id">顧客台帳から選ぶ</label>
          <select id="customer_id" name="customer_id" value={customerId} onChange={(event) => chooseCustomer(event.target.value)}>
            <option value="">台帳と関連付けない</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? `（${customer.phone}）` : ""}</option>)}
          </select>
        </div>
        <div className="grid cols-3">
          <div className="field"><label htmlFor="customer_name">お客様名 <span className="required-mark">必須</span></label><input id="customer_name" name="customer_name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required /></div>
          <div className="field"><label htmlFor="customer_phone">電話番号</label><input id="customer_phone" name="customer_phone" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></div>
          <div className="field"><label htmlFor="customer_email">メールアドレス</label><input id="customer_email" name="customer_email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} /></div>
        </div>
      </section>

      <section className="booking-form-section">
        <div className="section-heading"><div><p className="eyebrow">2. 内容と日時</p><h2>何を、いつ予約するか</h2></div></div>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="service_id">登録済みの予約内容</label>
            <select id="service_id" name="service_id" value={serviceId} onChange={(event) => chooseService(event.target.value)}>
              <option value="">直接入力する</option>
              {services.filter((service) => service.is_bookable).map((service) => <option key={service.id} value={service.id}>{service.name}（{service.duration_minutes}分）</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="service_name">予約内容</label><input id="service_name" name="service_name" value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="例：カット＋カラー" /></div>
          <div className="field"><label htmlFor="starts_at">開始 <span className="required-mark">必須</span></label><input id="starts_at" name="starts_at" type="datetime-local" value={startsAt} onChange={(event) => changeStart(event.target.value)} required /></div>
          <div className="field"><label htmlFor="ends_at">終了 <span className="required-mark">必須</span></label><input id="ends_at" name="ends_at" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></div>
          <div className="field"><label htmlFor="status">状態</label><select id="status" name="status" defaultValue={booking?.status ?? "confirmed"}>{Object.entries(bookingStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="field"><label htmlFor="source">受付経路</label><select id="source" name="source" defaultValue={booking?.source ?? "manual"}>{Object.entries(bookingSourceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        </div>
      </section>

      <section className="booking-form-section">
        <div className="section-heading"><div><p className="eyebrow">3. 担当・設備</p><h2>時間を確保する対象</h2></div><p>同じ担当者・部屋・設備の時間が重なる予約は保存できません。</p></div>
        {resources.length > 0 ? <div className="booking-resource-picker">
          {resources.filter((resource) => resource.is_bookable).map((resource) => <label className="booking-resource-option" key={resource.id} style={{ "--booking-color": resource.color } as CSSProperties}>
            <input type="checkbox" name="resource_ids" value={resource.id} defaultChecked={currentResourceIds.has(resource.id)} />
            <span><strong>{resource.name}</strong><small>{bookingResourceTypeLabels[resource.resource_type]}・同時{resource.capacity}件</small></span>
          </label>)}
        </div> : <p className="notice">担当者・席・部屋・設備はまだありません。予約自体は保存できますが、重複を防ぐには先に予約設定から登録してください。</p>}
      </section>

      <section className="booking-form-section">
        <div className="field"><label htmlFor="notes">店舗内メモ</label><textarea id="notes" name="notes" defaultValue={booking?.notes ?? ""} placeholder="要望、注意事項、引き継ぎなど" /></div>
      </section>
      <div className="form-actions">
        <PendingSubmitButton pendingLabel="予約を確認して保存しています...">{booking ? "予約の変更を保存" : "予約を登録"}</PendingSubmitButton>
        <Link className="button secondary" href={cancelHref}>保存せず戻る</Link>
      </div>
    </form>
  );
}
