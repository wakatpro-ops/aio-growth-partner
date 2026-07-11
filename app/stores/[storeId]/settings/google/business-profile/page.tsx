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
    case "not_requested":
    case "not_applied":
      return "未申請";
    case "pending":
    case "api_review_pending":
      return "確認中";
    case "rejected":
      return "投稿支援で利用中";
    case "approved":
      return "連携利用可能";
    case "manual_mode":
      return "投稿支援で利用中";
    default:
      return "投稿支援で利用中";
  }
}

function applicationResultLabel(value: unknown) {
  switch (value) {
    case "rejected":
      return "投稿支援で利用中";
    case "pending":
      return "確認中";
    case "approved":
      return "連携利用可能";
    case "not_requested":
      return "未申請";
    default:
      return "投稿支援で利用中";
  }
}

const retryChecklist = [
  "公式サイトにサービス概要がある",
  "運営者情報が明確",
  "プライバシーポリシーがある",
  "Googleビジネスプロフィールの利用目的が明確",
  "投稿内容を店舗担当者が確認してから反映する運用である",
  "ユーザー承認フローがある",
  "投稿履歴・操作ログが残る",
  "対象ビジネスプロフィールのオーナー/管理者権限がある"
];

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
  const apiStatus = textValue(setting?.metadata?.api_status) || textValue(setting?.status) || "manual_mode";
  const applicationResult = textValue(setting?.metadata?.api_application_result) || (apiStatus === "approved" ? "approved" : "rejected");
  const caseId = textValue(setting?.metadata?.basic_api_access_case_id) || "3-6455000041311";
  const rejectionReason = textValue(setting?.metadata?.rejection_reason) || "Google側の利用条件や権限設定により、現在は投稿文をコピーして反映する運用です。";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleビジネスプロフィール投稿支援" description="投稿文、CTA、URL、チェックリストを整理し、Google管理画面に反映しやすくします。" />
      <StoreBusinessNav store={store} />
      {synced ? <p className="notice success">Googleから候補を取得しました。アカウント {accounts ?? "0"} 件、ロケーション {locations ?? "0"} 件です。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>プロフィール設定: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
        <p>投稿支援の状態: <span className="badge">{applicationResultLabel(applicationResult)}</span></p>
        <p>連携状態: <span className="badge">{gbpApiStatusLabel(apiStatus)}</span></p>
        <p>補足: {rejectionReason}</p>
      </section>

      <section className="card">
        <h2>この画面でできること</h2>
        <ul className="compact-list">
          <li>Google投稿向けの本文、CTA、URL、投稿種別を確認できます。</li>
          <li>投稿前チェックリストを見ながら、Google管理画面に反映できます。</li>
          <li>投稿待ち、承認待ち、投稿済みの状態を記録できます。</li>
          <li>Googleアカウントが対象ビジネスプロフィールのオーナーまたは管理者であるか確認できます。</li>
        </ul>
        <div className="form-actions">
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions`}>集客アクションへ</Link>
          <Link className="button secondary" href="https://business.google.com/" target="_blank">Google管理画面を開く</Link>
        </div>
      </section>

      <section className="card">
        <h2>利用前の確認</h2>
        <ul className="compact-list">
          <li>公式サイト情報を整備します。</li>
          <li>ビジネスプロフィール情報を整備します。</li>
          <li>投稿内容を店舗担当者が確認してから反映します。</li>
          <li>Google管理画面で投稿先の店舗が正しいことを確認します。</li>
          <li>必要に応じて、Googleアカウントの権限や店舗管理者権限を確認します。</li>
        </ul>
        <div className="form-actions">
          <Link className="button secondary" href="https://developers.google.com/my-business/content/posts-data" target="_blank">投稿APIの公式情報</Link>
          <Link className="button secondary" href="https://developers.google.com/my-business/reference/rest" target="_blank">API一覧を確認</Link>
        </div>
      </section>

      <section className="card">
        <h2>投稿支援</h2>
        <p className="notice">投稿文の作成、確認、Google管理画面への反映、投稿済み記録までを整理できます。</p>
        <div className="grid cols-3">
          <article>
            <p className="muted">作成</p>
            <strong>AIが投稿文を作成</strong>
            <p>投稿文、CTA、URL、画像メモ、投稿種別を整理します。</p>
          </article>
          <article>
            <p className="muted">確認</p>
            <strong>投稿前チェック</strong>
            <p>画像、CTA、URL、投稿種別、対象店舗を確認してから手動投稿します。</p>
          </article>
          <article>
            <p className="muted">記録</p>
            <strong>手動投稿済みログ</strong>
            <p>投稿待ち、承認待ち、手動投稿済みの状態を残します。</p>
          </article>
        </div>
        <div className="form-actions">
          <Link className="button" href={`/stores/${store.id}/growth-actions`}>Google投稿下書きを確認</Link>
          <Link className="button secondary" href="https://business.google.com/" target="_blank">Google管理画面を開く</Link>
        </div>
      </section>

      <section className="card">
        <h2>Googleから候補を取得</h2>
        <p className="muted">接続済みGoogleアカウントでアクセスできるビジネスプロフィールの候補を取得します。投稿は行いません。</p>
        <p className="notice">候補取得には、Googleアカウントが対象ビジネスプロフィールのオーナーまたは管理者である必要があります。</p>
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
        <p className="notice">API承認前は、対象ロケーション、本文、CTA、画像、Google側ポリシーを確認しながら手動投稿支援モードで運用します。API承認後に同じ下書き・履歴を使って自動連携へ移行できます。</p>
      </section>

      <section className="card">
        <h2>投稿前チェックリスト</h2>
        <ul className="compact-list">
          {retryChecklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <form className="card form" action={upsertGoogleBusinessProfileAction.bind(null, store.id)}>
        <h2>Google店舗情報</h2>
        <div className="grid cols-2">
          <label className="field">連携状態
            <select name="api_status" defaultValue={apiStatus}>
              <option value="not_requested">未設定</option>
              <option value="pending">確認中</option>
              <option value="rejected">投稿支援で利用中</option>
              <option value="manual_mode">投稿支援で利用中</option>
              <option value="approved">連携利用可能</option>
            </select>
          </label>
          <label className="field">管理メモID
            <input name="basic_api_access_case_id" defaultValue={caseId} placeholder="任意の管理番号" />
          </label>
          <label className="field">確認日
            <input name="basic_api_access_submitted_at" defaultValue={textValue(setting?.metadata?.basic_api_access_submitted_at)} placeholder="例: 2026-07-06" />
          </label>
          <label className="field">確認結果
            <select name="api_application_result" defaultValue={applicationResult}>
              <option value="not_requested">未設定</option>
              <option value="pending">確認中</option>
              <option value="rejected">投稿支援で利用中</option>
              <option value="approved">連携利用可能</option>
            </select>
          </label>
        </div>
        <label className="field">現在の状態
          <textarea name="rejection_reason" rows={2} defaultValue={rejectionReason} />
        </label>
        <label className="field">運用メモ
          <textarea name="review_note" rows={3} defaultValue={textValue(setting?.metadata?.review_note) || "投稿文、CTA、URL、画像、投稿先店舗を確認してからGoogle管理画面へ反映する。"} />
        </label>
        <input type="hidden" name="manual_posting_mode" value="enabled" />
        <h2>Google店舗情報</h2>
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
