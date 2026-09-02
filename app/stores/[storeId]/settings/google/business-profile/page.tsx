import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGoogleIntegrationState, googleConnectionStatusLabel } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { syncGoogleBusinessProfileCandidatesAction, upsertGoogleBusinessProfileAction } from "../../../growth-actions/actions";

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
  const locationsList = state.locations;
  const capability = setting?.metadata?.posting_capabilities as Record<string, unknown> | undefined;
  const apiStatus = textValue(setting?.metadata?.api_status) || textValue(setting?.status) || "manual_mode";
  const applicationResult = textValue(setting?.metadata?.api_application_result) || (apiStatus === "approved" ? "approved" : "rejected");
  const rejectionReason = textValue(setting?.metadata?.rejection_reason) || "Google側の利用条件や権限設定により、現在は投稿文をコピーして反映する運用です。";
  const lastSyncStatus = textValue(setting?.metadata?.last_sync_status);
  const lastSyncErrorMessage = textValue(setting?.metadata?.last_sync_error_message);
  const lastSyncGuidance = textValue(setting?.metadata?.last_sync_guidance);
  const lastSyncFailedAt = textValue(setting?.metadata?.last_sync_failed_at);
  const syncNote = textValue(setting?.metadata?.sync_note);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Googleビジネスプロフィール投稿支援" description="投稿文、CTA、URL、チェックリストを整理し、Google管理画面に反映しやすくします。" />
      <StoreBusinessNav store={store} />
      {synced ? <p className="notice success">Googleから候補を取得しました。アカウント {accounts ?? "0"} 件、ロケーション {locations ?? "0"} 件です。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <h2>審査中もGoogleビジネスプロフィールは利用できます</h2>
        <p className="notice success">店舗情報の編集や投稿など、Google管理画面で行う通常の操作は審査中も利用できます。</p>
        <p>AIO boostで承認待ちなのは、プロフィール候補の自動取得や投稿の自動反映です。承認までは、AIO boostで下書きを作成・確認してから、Google管理画面へコピーして投稿できます。</p>
        <div className="form-actions">
          <Link className="button" href={`/stores/${store.id}/growth-actions`}>Google投稿下書きを作る</Link>
          <Link className="button secondary" href="https://business.google.com/" target="_blank">Google管理画面を開く</Link>
        </div>
      </section>

      <section className="card">
        <p>Google接続状態: <span className="badge">{googleConnectionStatusLabel(state.connection?.status)}</span></p>
        <p>AIO boostの連携方式: <span className="badge">{googleConnectionStatusLabel(setting?.status)}</span></p>
        <p>投稿支援の状態: <span className="badge">{applicationResultLabel(applicationResult)}</span></p>
        <p>連携状態: <span className="badge">{gbpApiStatusLabel(apiStatus)}</span></p>
        <p>補足: {rejectionReason}</p>
      </section>

      <section className="card">
        <h2>候補取得の確認結果</h2>
        {lastSyncStatus === "success" ? (
          <p className="notice success">{syncNote || "Googleから候補を取得できました。"}</p>
        ) : lastSyncStatus === "needs_location" ? (
          <p className="notice">{syncNote || "Googleアカウントは確認できましたが、投稿対象の店舗候補が見つかりませんでした。"}</p>
        ) : lastSyncStatus === "error" ? (
          <>
            <p className="notice danger">{lastSyncErrorMessage || "Googleビジネスプロフィール候補を取得できませんでした。"}</p>
            {lastSyncGuidance ? <p className="muted">確認ポイント: {lastSyncGuidance}</p> : null}
            {lastSyncFailedAt ? <p className="muted">最終確認: {new Date(lastSyncFailedAt).toLocaleString("ja-JP")}</p> : null}
          </>
        ) : (
          <p className="muted">まだ候補取得を実行していません。接続済みGoogleアカウントで対象店舗を管理している場合は、下のボタンから確認できます。</p>
        )}
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
          <PendingSubmitButton pendingLabel="Googleから店舗候補を取得しています...">アカウント・ロケーション候補を取得</PendingSubmitButton>
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
              <thead><tr><th>選択</th><th>店舗名</th><th>住所</th></tr></thead>
              <tbody>
                {locationsList.map((location) => (
                  <tr key={location.id}>
                    <td>{location.is_selected ? <span className="badge">選択中</span> : "候補"}</td>
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
        <h2>投稿先の店舗を選択</h2>
        <p className="notice">Googleから取得できた候補だけを選べます。店舗IDの手入力はできないため、別店舗への誤投稿を防げます。</p>
        <label className="field">Google店舗
          <select name="location_candidate_id" defaultValue={state.locations.find((item) => item.is_selected)?.id ?? ""} required>
            <option value="" disabled>店舗を選択してください</option>
            {state.locations.map((location) => (
              <option value={location.id} key={location.id}>{location.title ?? location.google_location_name} {location.address ? `— ${location.address}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="field">メモ
          <textarea name="memo" rows={3} defaultValue={typeof setting?.metadata?.memo === "string" ? setting.metadata.memo : ""} placeholder="Google側で確認すべきこと、運用担当など" />
        </label>
        <div className="form-actions">
          <PendingSubmitButton pendingLabel="投稿先を確認しています...">この店舗を投稿先に設定</PendingSubmitButton>
          <Link className="button secondary" href={`/stores/${store.id}/settings/google`}>Google連携へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
