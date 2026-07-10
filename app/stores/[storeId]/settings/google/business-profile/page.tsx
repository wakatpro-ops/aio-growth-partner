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
      return "審査待ち";
    case "rejected":
      return "却下確認済み / 手動投稿支援モード";
    case "approved":
      return "API承認済み";
    case "manual_mode":
      return "手動投稿支援モード";
    default:
      return "手動投稿支援モード";
  }
}

function applicationResultLabel(value: unknown) {
  switch (value) {
    case "rejected":
      return "却下確認済み";
    case "pending":
      return "審査待ち";
    case "approved":
      return "承認済み";
    case "not_requested":
      return "未申請";
    default:
      return "却下確認済み";
  }
}

const retryChecklist = [
  "公式サイトにサービス概要がある",
  "運営者情報が明確",
  "プライバシーポリシーがある",
  "Google Business Profile APIの利用目的が明確",
  "スパム投稿・自動大量投稿をしない設計である",
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
  const rejectionReason = textValue(setting?.metadata?.rejection_reason) || "Google内部の品質チェックにより、現時点ではAPI利用申請を進められない状態";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleビジネスプロフィール連携準備" description="API承認状況と、承認されるまでの手動投稿支援モードを管理します。" />
      <StoreBusinessNav store={store} />
      {synced ? <p className="notice success">Googleから候補を取得しました。アカウント {accounts ?? "0"} 件、ロケーション {locations ?? "0"} 件です。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>プロフィール設定: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
        <p>GBP API申請結果: <span className="badge">{applicationResultLabel(applicationResult)}</span></p>
        <p>Google Business Profile API status: <span className="badge">{gbpApiStatusLabel(apiStatus)}</span></p>
        <p>Basic API Access ケースID: <span className="badge">{caseId}</span></p>
        <p>理由: {rejectionReason}</p>
      </section>

      <section className="card">
        <h2>現在の扱い</h2>
        <ul className="compact-list">
          <li>Gmail下書き作成とGoogleカレンダー予定作成は本番成功済みのため、Google OAuth接続は合格扱いです。</li>
          <li><code>codexwakazono@gmail.com</code> は追加の検証用Googleアカウントとして扱います。</li>
          <li>Googleビジネスプロフィール候補取得には、接続したGoogleアカウントが対象ビジネスプロフィールのオーナーまたは管理者である必要があります。</li>
          <li>My Business系APIのquotaが0の場合、APIが有効化済みでも候補取得はできません。Gmail / Calendar APIとは審査とquotaが別です。</li>
          <li>ケースID <code>{caseId}</code> は承認されていないため、現時点では「却下確認済み」として扱います。</li>
          <li>承認までは、集客アクション詳細の「Google手動投稿補助」からコピー、チェックリスト、手動投稿済み記録を使って運用します。</li>
        </ul>
        <div className="form-actions">
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions`}>集客アクションへ</Link>
          <Link className="button secondary" href="https://business.google.com/" target="_blank">Google管理画面を開く</Link>
        </div>
      </section>

      <section className="card">
        <h2>次の対応</h2>
        <ul className="compact-list">
          <li>公式サイト情報を整備します。</li>
          <li>ビジネスプロフィール情報を整備します。</li>
          <li>申請主体とサービス内容の整合性を見直します。</li>
          <li>再申請文面を準備します。</li>
          <li>承認までは手動投稿支援モードで運用します。</li>
          <li>API承認後は、同じ画面で状態を「API承認済み」に変更し、account_id / location_id 候補取得へ戻ります。</li>
        </ul>
        <div className="form-actions">
          <Link className="button secondary" href="https://developers.google.com/my-business/content/posts-data" target="_blank">投稿APIの公式情報</Link>
          <Link className="button secondary" href="https://developers.google.com/my-business/reference/rest" target="_blank">API一覧を確認</Link>
        </div>
      </section>

      <section className="card">
        <h2>手動投稿支援モード</h2>
        <p className="notice">Google Business Profile APIが未承認または却下済みでも、投稿文の作成・確認・手動投稿記録はこのまま運用できます。</p>
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
        <p className="muted">接続済みGoogleアカウントでアクセスできるビジネスプロフィールのアカウントIDとロケーションIDを取得します。実投稿は行いません。</p>
        <p className="notice">現在はBasic API Accessが承認されていないため、候補取得は失敗する可能性が高い状態です。Gmail / Calendar が接続済みでも、GBP APIは別審査です。</p>
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
        <h2>再申請準備チェックリスト</h2>
        <ul className="compact-list">
          {retryChecklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <form className="card form" action={upsertGoogleBusinessProfileAction.bind(null, store.id)}>
        <h2>Google審査・API状態</h2>
        <div className="grid cols-2">
          <label className="field">API status
            <select name="api_status" defaultValue={apiStatus}>
              <option value="not_requested">未申請</option>
              <option value="pending">審査待ち</option>
              <option value="rejected">却下確認済み</option>
              <option value="manual_mode">手動投稿支援モード</option>
              <option value="approved">API承認済み</option>
            </select>
          </label>
          <label className="field">Basic API Access ケースID
            <input name="basic_api_access_case_id" defaultValue={caseId} placeholder="3-xxxxxxxxxxxx" />
          </label>
          <label className="field">申請日
            <input name="basic_api_access_submitted_at" defaultValue={textValue(setting?.metadata?.basic_api_access_submitted_at)} placeholder="例: 2026-07-06" />
          </label>
          <label className="field">申請結果
            <select name="api_application_result" defaultValue={applicationResult}>
              <option value="not_requested">未申請</option>
              <option value="pending">審査待ち</option>
              <option value="rejected">却下確認済み</option>
              <option value="approved">承認済み</option>
            </select>
          </label>
        </div>
        <label className="field">却下理由・現在の状態
          <textarea name="rejection_reason" rows={2} defaultValue={rejectionReason} />
        </label>
        <label className="field">審査メモ
          <textarea name="review_note" rows={3} defaultValue={textValue(setting?.metadata?.review_note) || "Basic API Accessは承認されていないため、承認までは手動投稿支援モードで運用。再申請前に公式サイト、運営者情報、プライバシーポリシー、ユーザー承認フロー、操作ログを整理する。"} />
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
