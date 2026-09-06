import { AppShell } from "@/components/layout/app-shell";
import { BookingForm } from "@/components/bookings/booking-form";
import { PageHeader } from "@/components/ui/page-header";
import { listBookingResources, listBookingServices } from "@/lib/bookings";
import { toJapanDateTimeLocal } from "@/lib/bookings/rules";
import { listCustomers } from "@/lib/phase2/business-data";
import { getStore } from "@/lib/stores";
import { createBookingAction } from "../actions";
import { canEditStore } from "@/lib/auth/server";
import { notFound } from "next/navigation";

function defaultStart() {
  const now = new Date();
  const next = new Date(Math.ceil((now.getTime() + 15 * 60_000) / (30 * 60_000)) * 30 * 60_000);
  return next;
}

export default async function NewBookingPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) notFound();
  const [services, resources, customers] = await Promise.all([listBookingServices(store.id), listBookingResources(store.id), listCustomers(store.id, 2000)]);
  const startsAt = defaultStart();
  const defaultDuration = services.find((service) => service.is_bookable)?.duration_minutes ?? 60;
  const endsAt = new Date(startsAt.getTime() + defaultDuration * 60_000);
  return <AppShell>
    <PageHeader eyebrow="予約" title="予約を登録" description="日時とお客様を確認し、必要なら担当者・席・部屋・設備の時間を確保します。" />
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
    <BookingForm action={createBookingAction.bind(null, store.id)} services={services} resources={resources} customers={customers} initialStartsAt={toJapanDateTimeLocal(startsAt)} initialEndsAt={toJapanDateTimeLocal(endsAt)} cancelHref={`/stores/${store.id}/bookings`} />
  </AppShell>;
}
