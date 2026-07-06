import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGrowthAction, growthActionStatusLabel } from "@/lib/phase5/growth-actions";
import { getGoogleIntegrationState } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import { markGoogleBusinessProfileManualPostAction } from "../../actions";
import type { GrowthActionDraft } from "@/types/phase5";

const postTypes = [
  { value: "standard", label: "最新情報" },
  { value: "event", label: "イベント" },
  { value: "offer", label: "特典" }
];

const ctaTypes = [
  { value: "none", label: "なし" },
  { value: "book", label: "予約" },
  { value: "order", label: "注文" },
  { value: "shop", label: "購入" },
  { value: "learn_more", label: "詳細" },
  { value: "sign_up", label: "登録" },
  { value: "call", label: "電話" }
];

const checklist = [
  "投稿対象のGoogleビジネスプロフィール店舗が正しい",
  "投稿タイプが内容に合っている",
  "CTAとリンク先URLの内容が一致している",
  "本文に古い営業時間・価格・期限が入っていない",
  "CTAのリンク先または電話導線を確認した",
  "画像を使う場合、権利・内容・見切れを確認した",
  "承認済みまたは責任者確認済み"
];

function googleDraft(action: NonNullable<Awaited<ReturnType<typeof getGrowthAction>>>) {
  return (action.drafts ?? []).find((draft) => draft.channel === "google_business_profile") ?? action.drafts?.[0] ?? null;
}

function copyText(draft: GrowthActionDraft) {
  return [
    draft.body,
    draft.hashtags.length ? draft.hashtags.join(" ") : null,
    draft.call_to_action
  ].filter(Boolean).join("\n\n");
}

function postedMetadata(action: NonNullable<Awaited<ReturnType<typeof getGrowthAction>>>) {
  const value = action.metadata?.manual_google_business_profile;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export default async function GoogleBusinessManualPostPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; actionId: string }>;
  searchParams: Promise<{ error?: string; posted?: string }>;
}) {
  const { storeId, actionId } = await params;
  const { error, posted } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "google_business_profile_drafts")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action) notFound();
  const googleState = await getGoogleIntegrationState(store.id);
  const draft = googleDraft(action);
  if (!draft) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const text = copyText(draft);
  const manual = postedMetadata(action);
  const defaultPostedAt = new Date().toISOString().slice(0, 16);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Google手動投稿補助" description="API実投稿を使わず、Googleビジネスプロフィール管理画面へ手動投稿するための確認と記録を行います。" />
      <StoreBusinessNav store={store} />
      {posted ? <p className="notice success">手動投稿済みとして記録しました。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <div className="grid cols-3">
          <label className="field">承認状態
            <input value={growthActionStatusLabel(action.status)} readOnly />
          </label>
          <label className="field">外部状態
            <input value={action.external_status ?? "not_connected"} readOnly />
          </label>
          <label className="field">手動投稿日時
            <input value={typeof manual?.posted_at === "string" ? new Date(manual.posted_at).toLocaleString("ja-JP") : "-"} readOnly />
          </label>
        </div>
        <p className="notice">Google Business Profile APIはBasic API Access / quota付与待ちのため、ここでは手動投稿を前提にします。外部APIへの投稿は実行しません。</p>
        <p className="muted">
          Google接続済みアカウント: {googleState.connection?.email ?? "未接続"} / 保存済みロケーション: {googleState.businessProfile?.location_name ?? googleState.businessProfile?.location_id ?? "未設定"}
        </p>
      </section>

      <section className="card">
        <h2>手動投稿の流れ</h2>
        <ul className="compact-list">
          <li>下の本文をコピーし、「Google管理画面を開く」から対象店舗の投稿画面へ移動します。</li>
          <li>投稿種別、CTA、URL、画像をGoogle側で確認してから投稿します。</li>
          <li>投稿後、この画面で投稿URL、担当者、チェックリストを保存します。</li>
          <li>将来GBP APIが承認されたら、保存済みのGoogleアカウントID / ロケーションIDを使ってAPI投稿へ切り替えます。</li>
        </ul>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>コピー用</h2>
          <label className="field">投稿タイトル・管理名
            <input value={draft.title} readOnly />
          </label>
          <label className="field">Google投稿本文
            <textarea rows={14} value={text} readOnly />
          </label>
          {draft.short_body ? (
            <label className="field">短縮版
              <textarea rows={4} value={draft.short_body} readOnly />
            </label>
          ) : null}
          <div className="form-actions">
            <Link className="button secondary" href="https://business.google.com/" target="_blank">Google管理画面を開く</Link>
            <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/edit`}>下書きを編集</Link>
          </div>
        </article>

        <article className="card google-manual-preview">
          <p className="muted">Googleビジネスプロフィール投稿プレビュー</p>
          <h2>{draft.title}</h2>
          <p>{draft.body}</p>
          {draft.hashtags.length ? <p>{draft.hashtags.join(" ")}</p> : null}
          {draft.call_to_action ? <strong>{draft.call_to_action}</strong> : null}
        </article>
      </section>

      <form className="card form" action={markGoogleBusinessProfileManualPostAction.bind(null, store.id, action.id)}>
        <h2>投稿前チェックリスト</h2>
        <div className="grid cols-2">
          <label className="field">投稿タイプ
            <select name="post_type" defaultValue={typeof manual?.post_type === "string" ? manual.post_type : "standard"}>
              {postTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="field">CTA
            <select name="cta_type" defaultValue={typeof manual?.cta_type === "string" ? manual.cta_type : "learn_more"}>
              {ctaTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="field">手動投稿日時
            <input name="posted_at" type="datetime-local" defaultValue={typeof manual?.posted_at === "string" ? String(manual.posted_at).slice(0, 16) : defaultPostedAt} />
          </label>
          <label className="field">投稿URLまたは管理メモ用URL
            <input name="public_url" defaultValue={typeof manual?.public_url === "string" ? manual.public_url : ""} placeholder="https://..." />
          </label>
          <label className="field">対象店舗メモ
            <input name="target_location_note" defaultValue={typeof manual?.target_location_note === "string" ? manual.target_location_note : ""} placeholder="例: AIOオート整備 本店" />
          </label>
          <label className="field">画像メモ
            <input name="image_note" defaultValue={typeof manual?.image_note === "string" ? manual.image_note : ""} placeholder="例: 点検作業写真、外観写真、画像なし" />
          </label>
          <label className="field">担当者
            <input name="operator_name" defaultValue={typeof manual?.operator_name === "string" ? manual.operator_name : ""} placeholder="担当者名" />
          </label>
          <label className="field">メモ
            <input name="memo" defaultValue={typeof manual?.memo === "string" ? manual.memo : ""} placeholder="投稿時の注意、画像名、確認事項など" />
          </label>
        </div>
        <div className="manual-checklist">
          {checklist.map((item) => (
            <label className="check-row" key={item}>
              <input name="checklist" type="checkbox" value={item} defaultChecked={Array.isArray(manual?.checklist) && manual.checklist.includes(item)} />
              {item}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button className="button" type="submit">手動投稿済みとして記録</button>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>詳細へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
