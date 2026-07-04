import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { upsertGoogleGmailAction } from "../../../growth-actions/actions";

export default async function GoogleGmailPage({
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
  if (!isFeatureEnabled(flags, "gmail_draft_integration")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const setting = state.gmail;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Gmail下書き作成準備" description="既存顧客への案内文をGmail下書きにするための送信元情報を管理します。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>Gmail設定: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
      </section>

      <form className="card form" action={upsertGoogleGmailAction.bind(null, store.id)}>
        <div className="grid cols-2">
          <label className="field">送信元メール
            <input name="email" type="email" defaultValue={setting?.email ?? state.connection?.email ?? ""} placeholder="owner@example.com" />
          </label>
          <label className="field">送信者名
            <input name="sender_name" defaultValue={setting?.sender_name ?? store.name} />
          </label>
        </div>
        <label className="field">署名
          <textarea name="signature" rows={5} defaultValue={setting?.signature ?? `${store.name}\n${store.phone}\n${store.address}`} />
        </label>
        <div className="form-actions">
          <button className="button" type="submit">保存</button>
          <Link className="button secondary" href={`/stores/${store.id}/settings/google`}>Google連携へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
