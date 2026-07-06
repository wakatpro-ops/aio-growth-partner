import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGrowthAction, growthActionChannelLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { markSnsManualPostAction } from "../../actions";
import type { GrowthActionDraft } from "@/types/phase5";

const snsChannels = [
  { value: "instagram", label: "Instagram", guide: "写真や整備風景と一緒に、親しみやすく保存されやすい文章にします。" },
  { value: "line", label: "LINE", guide: "短く分かりやすく、既存顧客への案内として使いやすい文章にします。" },
  { value: "x", label: "X", guide: "短文で要点とCTAを先に出し、拡散や即時告知向けにします。" },
  { value: "facebook", label: "Facebook", guide: "地域の方向けに、少し丁寧で説明を含む文章にします。" }
];

const postGoals = [
  { value: "new_customer", label: "新規集客" },
  { value: "existing_customer_follow", label: "既存顧客フォロー" },
  { value: "campaign", label: "キャンペーン" },
  { value: "seasonal_notice", label: "季節案内" },
  { value: "review_promotion", label: "口コミ促進" },
  { value: "booking_promotion", label: "予約促進" }
];

const manualStatuses = [
  { value: "draft", label: "下書き" },
  { value: "approval_pending", label: "承認待ち" },
  { value: "approved", label: "承認済み" },
  { value: "manual_published", label: "手動投稿済み" }
];

const checklist = [
  "画像あり",
  "CTAあり",
  "URLあり",
  "ハッシュタグあり",
  "投稿前確認済み"
];

function primaryDraft(action: NonNullable<Awaited<ReturnType<typeof getGrowthAction>>>) {
  return (action.drafts ?? []).find((draft) => draft.channel === action.target_channel) ?? action.drafts?.[0] ?? null;
}

function metadata(action: NonNullable<Awaited<ReturnType<typeof getGrowthAction>>>) {
  const value = action.metadata?.manual_sns_post;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function baseText(draft: GrowthActionDraft) {
  return [
    draft.body,
    draft.hashtags.length ? draft.hashtags.join(" ") : null,
    draft.call_to_action
  ].filter(Boolean).join("\n\n");
}

function snsText(draft: GrowthActionDraft, channel: string, storeName: string) {
  const hashtags = draft.hashtags.length ? draft.hashtags.join(" ") : "";
  const cta = draft.call_to_action ?? "詳しくはお問い合わせください";
  if (channel === "line") {
    return [`【${storeName}】`, draft.short_body ?? draft.body, cta].filter(Boolean).join("\n");
  }
  if (channel === "x") {
    const text = `${draft.short_body ?? draft.body} ${cta}`.slice(0, 230);
    return [text, hashtags].filter(Boolean).join("\n");
  }
  if (channel === "facebook") {
    return [`${draft.title}`, "", draft.body, "", `ご相談・ご予約: ${cta}`, hashtags].filter(Boolean).join("\n");
  }
  return [draft.body, "", cta, hashtags].filter(Boolean).join("\n");
}

export default async function SnsManualPostPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string; actionId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { storeId, actionId } = await params;
  const { error, saved } = await searchParams;
  const store = await getStore(storeId);
  const flags = resolveFeatureFlags(store);
  if (!isFeatureEnabled(flags, "growth_action_center")) notFound();
  const action = await getGrowthAction(store.id, actionId);
  if (!action) notFound();
  const draft = primaryDraft(action);
  if (!draft) notFound();
  const industry = getIndustryConfig(store.industry_type_key);
  const manual = metadata(action);
  const selectedChannel = typeof manual?.sns_channel === "string"
    ? manual.sns_channel
    : action.target_channel === "line" || action.target_channel === "instagram" ? action.target_channel : "instagram";
  const manualStatus = typeof manual?.status === "string"
    ? manual.status
    : action.external_status === "manual_published" || action.status === "done" ? "manual_published" : "draft";
  const defaultPostedAt = new Date().toISOString().slice(0, 16);
  const imageIdea = typeof action.metadata?.ai_output === "object"
    ? (action.metadata.ai_output as { draft?: { recommended_image_idea?: string } }).draft?.recommended_image_idea
    : null;

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="SNS手動投稿支援" description="Instagram、LINE、X、Facebookへコピーして投稿できるように、媒体別の文章と確認項目を整えます。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">SNS投稿状態を保存しました。</p> : null}
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}

      <section className="card">
        <div className="grid cols-3">
          <label className="field">元チャネル
            <input value={growthActionChannelLabel(action.target_channel)} readOnly />
          </label>
          <label className="field">投稿ステータス
            <input value={manualStatuses.find((status) => status.value === manualStatus)?.label ?? manualStatus} readOnly />
          </label>
          <label className="field">推奨実行日
            <input value={action.recommended_date ?? "-"} readOnly />
          </label>
        </div>
        <p className="notice">現段階ではSNS APIへの実投稿は行いません。Meta Graph APIやLINE APIの接続に備えて、媒体、ステータス、投稿URL、確認ログだけを保存します。</p>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>元下書き</h2>
          <label className="field">タイトル
            <input value={draft.title} readOnly />
          </label>
          <label className="field">コピー用本文
            <textarea rows={12} value={baseText(draft)} readOnly />
          </label>
          <label className="field">画像キャプション設計メモ
            <textarea rows={4} value={imageIdea ?? "画像URLまたは画像アップロードを受け取り、将来は画像内容からキャプション・代替文・投稿文を生成します。Phase 5-Dでは画像URLと画像メモを保存します。"} readOnly />
          </label>
        </article>

        <article className="card">
          <h2>媒体別プレビュー</h2>
          {snsChannels.map((channel) => (
            <label className="field" key={channel.value}>{channel.label}
              <textarea rows={channel.value === "x" ? 4 : 7} value={snsText(draft, channel.value, store.name)} readOnly />
              <span className="muted">{channel.guide}</span>
            </label>
          ))}
        </article>
      </section>

      <form className="card form" action={markSnsManualPostAction.bind(null, store.id, action.id)}>
        <h2>投稿運用メモ</h2>
        <div className="grid cols-2">
          <label className="field">投稿先
            <select name="sns_channel" defaultValue={selectedChannel}>
              {snsChannels.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}
            </select>
          </label>
          <label className="field">投稿目的
            <select name="post_goal" defaultValue={typeof manual?.post_goal === "string" ? manual.post_goal : "new_customer"}>
              {postGoals.map((goal) => <option key={goal.value} value={goal.value}>{goal.label}</option>)}
            </select>
          </label>
          <label className="field">投稿ステータス
            <select name="manual_status" defaultValue={manualStatus}>
              {manualStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label className="field">手動投稿日時
            <input name="posted_at" type="datetime-local" defaultValue={typeof manual?.posted_at === "string" ? String(manual.posted_at).slice(0, 16) : defaultPostedAt} />
          </label>
          <label className="field">画像URL
            <input name="image_url" defaultValue={typeof manual?.image_url === "string" ? manual.image_url : ""} placeholder="https://..." />
          </label>
          <label className="field">投稿URLまたは管理メモ用URL
            <input name="public_url" defaultValue={typeof manual?.public_url === "string" ? manual.public_url : ""} placeholder="https://..." />
          </label>
          <label className="field">担当者
            <input name="operator_name" defaultValue={typeof manual?.operator_name === "string" ? manual.operator_name : ""} placeholder="担当者名" />
          </label>
          <label className="field">画像メモ
            <input name="image_note" defaultValue={typeof manual?.image_note === "string" ? manual.image_note : ""} placeholder="例: 作業風景、商品写真、外観写真" />
          </label>
        </div>
        <label className="field">選んだ投稿本文
          <textarea name="selected_text" rows={10} defaultValue={typeof manual?.selected_text === "string" ? manual.selected_text : snsText(draft, selectedChannel, store.name)} />
        </label>
        <label className="field">メモ
          <textarea name="memo" rows={3} defaultValue={typeof manual?.memo === "string" ? manual.memo : ""} placeholder="投稿前の確認事項、画像ファイル名、承認者など" />
        </label>
        <div className="manual-checklist">
          {checklist.map((item) => (
            <label className="check-row" key={item}>
              <input name="checklist" type="checkbox" value={item} defaultChecked={Array.isArray(manual?.checklist) && manual.checklist.includes(item)} />
              {item}
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button className="button" type="submit">SNS投稿状態を保存</button>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/edit`}>下書きを編集</Link>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>詳細へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
