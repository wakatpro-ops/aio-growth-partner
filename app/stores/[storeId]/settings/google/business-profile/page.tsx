import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { syncGoogleBusinessProfileCandidatesAction, upsertGoogleBusinessProfileAction } from "../../../growth-actions/actions";

type CandidateLocation = {
  accountName?: string;
  name?: string;
  title?: string;
  address?: string;
  storeCode?: string;
};

function candidateLocations(metadata: Record<string, unknown> | undefined) {
  const locations = metadata?.locations;
  if (!Array.isArray(locations)) return [];
  return locations.filter((item): item is CandidateLocation => Boolean(item && typeof item === "object"));
}

function candidateAccounts(metadata: Record<string, unknown> | undefined) {
  const accounts = metadata?.accounts;
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((item): item is { name?: string; accountName?: string; type?: string; role?: string } => Boolean(item && typeof item === "object"));
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function gbpApiStatusLabel(value: unknown) {
  switch (value) {
    case "api_review_pending":
      return "Google審査待ち";
    case "approved":
      return "API承認済み";
    case "manual_mode":
      return "手動投稿支援モード";
    case "not_applied":
      return "未申請";
    default:
      return "Google審査待ち";
  }
}

export default async function GoogleBusinessProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; synced?: string; accounts?: string; locations?: string }>;
}) {
  const { storeId } = await params;
  const { error, synced, accounts, locations } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "google_business_profile_integration")) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const setting = state.businessProfile;
  const accountsList = candidateAccounts(setting?.metadata);
  const locationsList = candidateLocations(setting?.metadata);
  const capability = setting?.metadata?.posting_capabilities as Record<string, unknown> | undefined;
  const apiStatus = textValue(setting?.metadata?.api_status) || "api_review_pending";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleビジネスプロフィール連携準備" description="ロケーション選択と投稿可能状態を管理します。Phase 5-Cでは実投稿は行いません。" />
      <StoreBusinessNav store={store} />
      {synced ? <p className="notice success">Googleから候補を取得しました。アカウント {accounts ?? "0"} 件、ロケーション {locations ?? "0"} 件です。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>プロフィール設定: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
        <p>Google Business Profile API status: <span className="badge">{gbpApiStatusLabel(apiStatus)}</span></p>
        <p>Basic API Access ケースID: <span className="badge">{textValue(setting?.metadata?.basic_api_access_case_id) || "3-6455000041311"}</span></p>
      </section>

      <section className="card">
        <h2>現在の扱い</h2>
        <ul className="compact-list">
          <li>Gmail下書き作成とGoogleカレンダー予定作成は本番成功済みのため、Google OAuth接続は合格扱いです。</li>
          <li><code>codexwakazono@gmail.com</code> は追加の検証用Googleアカウントとして扱います。</li>
          <li>Googleビジネスプロフィール候補取得には、接続したGoogleアカウントが対象ビジネスプロフィールのオーナーまたは管理者である必要があります。</li>
          <li>API有効化済みでも、Google側のBasic API Access / quota付与が未承認の場合は候補取得が失敗します。この場合はアプリ不具合ではなくGoogle承認待ちです。</li>
          <li>Basic API Access申請済みケースID: <code>{textValue(setting?.metadata?.basic_api_access_case_id) || "3-6455000041311"}</code> / 審査目安: {textValue(setting?.metadata?.basic_api_access_expected_review) || "7〜10営業日"}</li>
          <li>承認待ちの間は、集客アクション詳細の「Google手動投稿補助」からコピー、チェックリスト、手動投稿済み記録を使って運用します。</li>
        </ul>
        <div className="form-actions">
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions`}>集客アクションへ</Link>
          <Link className="button secondary" href="https://business.google.com/" target="_blank">Google管理画面を開く</Link>
        </div>
      </section>

      <section className="card">
        <h2>実投稿前の確認</h2>
        <ul className="compact-list">
          <li>Google Business Profile API と対象ロケーションへのアクセス権限を確認します。</li>
          <li>接続したGoogleアカウントが、投稿対象ビジネスプロフィールのオーナーまたは管理者であることを確認します。</li>
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

      <section className="card">
        <h2>Googleから候補を取得</h2>
        <p className="muted">接続済みGoogleアカウントでアクセスできるビジネスプロフィールのアカウントIDとロケーションIDを取得します。実投稿は行いません。</p>
        <form action={syncGoogleBusinessProfileCandidatesAction.bind(null, store.id)}>
          <button className="button" type="submit">アカウント・ロケーション候補を取得</button>
        </form>
        <p className="muted">最終取得: {setting?.last_synced_at ? new Date(setting.last_synced_at).toLocaleString("ja-JP") : "-"}</p>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>取得済みアカウント</h2>
          {accountsList.length ? (
            <table className="table compact">
              <thead><tr><th>アカウントID</th><th>表示名</th><th>種別</th></tr></thead>
              <tbody>
                {accountsList.map((account) => (
                  <tr key={account.name}>
                    <td>{account.name ?? "-"}</td>
                    <td>{account.accountName ?? "-"}</td>
                    <td>{account.type ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">まだ候補を取得していません。</p>}
        </article>

        <article className="card">
          <h2>取得済みロケーション</h2>
          {locationsList.length ? (
            <table className="table compact">
              <thead><tr><th>ロケーションID</th><th>店舗名</th><th>住所</th></tr></thead>
              <tbody>
                {locationsList.map((location) => (
                  <tr key={`${location.accountName}-${location.name}`}>
                    <td>{location.name ?? "-"}</td>
                    <td>{location.title ?? "-"}</td>
                    <td>{location.address ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">まだ候補を取得していません。</p>}
        </article>
      </section>

      <section className="card">
        <h2>投稿可能形式と制限</h2>
        <div className="grid cols-3">
          <article>
            <p className="muted">投稿形式</p>
            <strong>{Array.isArray(capability?.supported_post_types) ? capability.supported_post_types.join(" / ") : "STANDARD / EVENT / OFFER"}</strong>
          </article>
          <article>
            <p className="muted">CTA</p>
            <strong>{Array.isArray(capability?.supported_call_to_actions) ? capability.supported_call_to_actions.join(" / ") : "BOOK / ORDER / SHOP / LEARN_MORE / SIGN_UP / CALL"}</strong>
          </article>
          <article>
            <p className="muted">商品投稿</p>
            <strong>API作成不可</strong>
          </article>
        </div>
        <p className="notice">Phase 5-C-5では、アカウント・ロケーション確認までです。実投稿は、対象ロケーション、本文、CTA、画像、Google側ポリシー確認を通してから次フェーズで行います。</p>
      </section>

      <form className="card form" action={upsertGoogleBusinessProfileAction.bind(null, store.id)}>
        <h2>Google審査・API状態</h2>
        <div className="grid cols-2">
          <label className="field">API status
            <select name="api_status" defaultValue={apiStatus}>
              <option value="api_review_pending">Google審査待ち</option>
              <option value="manual_mode">手動投稿支援モード</option>
              <option value="approved">API承認済み</option>
              <option value="not_applied">未申請</option>
            </select>
          </label>
          <label className="field">Basic API Access ケースID
            <input name="basic_api_access_case_id" defaultValue={textValue(setting?.metadata?.basic_api_access_case_id) || "3-6455000041311"} placeholder="3-xxxxxxxxxxxx" />
          </label>
          <label className="field">申請日
            <input name="basic_api_access_submitted_at" defaultValue={textValue(setting?.metadata?.basic_api_access_submitted_at)} placeholder="例: 2026-07-06" />
          </label>
          <label className="field">審査目安
            <input name="basic_api_access_expected_review" defaultValue={textValue(setting?.metadata?.basic_api_access_expected_review) || "7〜10営業日"} />
          </label>
        </div>
        <label className="field">審査メモ
          <textarea name="review_note" rows={3} defaultValue={textValue(setting?.metadata?.review_note) || "認証済みビジネスオーナーが自分のGoogleアカウントを接続し、自分が管理するBusiness Profile locationを選択、投稿ワークフロー準備、月次レポート活用を行う用途。"} />
        </label>
        <input type="hidden" name="manual_posting_mode" value="enabled" />
        <h2>account_id / location_id候補</h2>
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
