import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { upsertGoogleCalendarAction } from "../../../growth-actions/actions";

export default async function GoogleCalendarPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { storeId } = await params;
  const { error } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "google_calendar_integration")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const setting = state.calendar;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleカレンダー連携準備" description="投稿・配信・案内の予定作成に使うカレンダーを管理します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>カレンダー設定: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
      </section>

      <form className="card form" action={upsertGoogleCalendarAction.bind(null, store.id)}>
        <div className="grid cols-2">
          <label className="field">カレンダーID
            <input name="calendar_id" defaultValue={setting?.calendar_id ?? "primary"} />
          </label>
          <label className="field">カレンダー名
            <input name="calendar_name" defaultValue={setting?.calendar_name ?? `${store.name} 集客予定`} />
          </label>
          <label className="field">タイムゾーン
            <input name="timezone" defaultValue={setting?.timezone ?? "Asia/Tokyo"} />
          </label>
        </div>
        <div className="form-actions">
          <button className="button" type="submit">保存</button>
          <Link className="button secondary" href={`/stores/${store.id}/settings/google`}>Google連携へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
