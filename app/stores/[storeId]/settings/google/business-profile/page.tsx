import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { upsertGoogleBusinessProfileAction } from "../../../growth-actions/actions";

export default async function GoogleBusinessProfilePage({
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
  if (!isFeatureEnabled(flags, "google_business_profile_integration")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const setting = state.businessProfile;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleビジネスプロフィール連携準備" description="ロケーション選択と投稿可能状態を管理します。Phase 5-Cでは実投稿は行いません。" />
      <StoreBusinessNav store={store} />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>プロフィール設定: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
      </section>

      <section className="card">
        <h2>実投稿前の確認</h2>
        <ul className="compact-list">
          <li>Google Business Profile API と対象ロケーションへのアクセス権限を確認します。</li>
          <li>Google側のアカウントIDとロケーションIDを取得して、この画面に保存します。</li>
          <li>投稿は「最新情報」「イベント」「特典」などの対応形式から開始します。</li>
          <li>商品投稿はAPIで作成できない制限があるため、別導線として扱います。</li>
          <li>実投稿前に、必ず送信前確認画面で本文、URL、画像、CTAを確認します。</li>
        </ul>
        <div className="form-actions">
          <Link className="button secondary" href="https://developers.google.com/my-business/content/posts-data" target="_blank">投稿APIの公式情報</Link>
          <Link className="button secondary" href="https://developers.google.com/my-business/reference/rest" target="_blank">API一覧を確認</Link>
        </div>
      </section>

      <form className="card form" action={upsertGoogleBusinessProfileAction.bind(null, store.id)}>
        <div className="grid cols-2">
          <label className="field">GoogleアカウントID
            <input name="google_account_id" defaultValue={setting?.google_account_id ?? ""} placeholder="accounts/xxxx" />
          </label>
          <label className="field">ロケーションID
            <input name="location_id" defaultValue={setting?.location_id ?? ""} placeholder="locations/xxxx" />
          </label>
          <label className="field">ロケーション名
            <input name="location_name" defaultValue={setting?.location_name ?? store.name} />
          </label>
          <label className="field">住所
            <input name="address" defaultValue={setting?.address ?? store.address} />
          </label>
        </div>
        <label className="field">メモ
          <textarea name="memo" rows={3} defaultValue={typeof setting?.metadata?.memo === "string" ? setting.metadata.memo : ""} placeholder="Google側で確認すべきこと、運用担当など" />
        </label>
        <div className="form-actions">
          <button className="button" type="submit">保存</button>
          <Link className="button secondary" href={`/stores/${store.id}/settings/google`}>Google連携へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
