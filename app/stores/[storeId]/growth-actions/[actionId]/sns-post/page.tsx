import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { getGrowthAction, growthActionChannelLabel } from "@/lib/phase5/growth-actions";
import { getStore } from "@/lib/stores";
import { approveSnsMediaAction, archiveSnsMediaAction, markSnsManualPostAction, queueSnsPublishAction, retrySnsPublishAction, uploadSnsMediaAction } from "../../actions";
import type { GrowthActionDraft } from "@/types/phase5";
import { getSnsMediaPreview, listSnsMedia, listSnsPublishJobs } from "@/lib/phase5/sns-publishing";
import { SNS_CHANNELS, SNS_LIMITS } from "@/lib/phase5/sns-rules";

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
  searchParams: Promise<{ error?: string; saved?: string; uploaded?: string; duplicate?: string; approved?: string; deleted?: string; queued?: string; retried?: string }>;
}) {
  const { storeId, actionId } = await params;
  const statusParams = await searchParams;
  const { error, saved } = statusParams;
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
  const media = await listSnsMedia(store.id, action.id);
  const mediaWithPreview = await Promise.all(media.map(async (item) => ({ ...item, preview_url: await getSnsMediaPreview(store.id, action.id, String(item.id)) })));
  const publishJobs = await listSnsPublishJobs(store.id, action.id);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="SNS手動投稿支援" description="Instagram、LINE、X、Facebookへコピーして投稿できるように、媒体別の文章と確認項目を整えます。" />
      <StoreBusinessNav store={store} />
      {saved ? <p className="notice success">SNS投稿状態を保存しました。</p> : null}
      {statusParams.uploaded ? <p className="notice success">画像を取り込み、AIが媒体別の投稿案を作成しました。内容を確認してください。</p> : null}
      {statusParams.duplicate ? <p className="notice">同じ画像はすでに取り込まれているため、既存データを表示しています。</p> : null}
      {statusParams.approved ? <p className="notice success">画像の安全確認と投稿文の承認を保存しました。</p> : null}
      {statusParams.deleted ? <p className="notice success">画像を削除しました。公開履歴の証跡は保持しています。</p> : null}
      {statusParams.queued ? <p className="notice success">投稿処理を受け付けました。未接続の媒体は手動投稿用として保存しました。</p> : null}
      {statusParams.retried ? <p className="notice success">投稿を再実行しました。</p> : null}
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
        <p className="notice">Instagram・FacebookはMeta接続済みなら承認後に直接投稿できます。X・LINE、未接続・認証期限切れの場合は、画像と媒体別本文を保存して手動投稿へ切り替えます。</p>
      </section>

      <section className="card" id="sns-media">
        <h2>1. 写真を取り込む</h2>
        <p>JPG・PNG・WebP（8MB以内）を安全に保存し、画像内容、店舗情報、商品・メニュー情報から投稿案を作ります。同じ画像の重複登録は防止します。</p>
        <form className="form" action={uploadSnsMediaAction.bind(null, store.id, action.id)}>
          <div className="grid cols-2">
            <label className="field">投稿する写真（必須）<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
            <label className="field">写真の補足<input name="image_note" placeholder="例：新メニューの施術写真、店内の個室" /></label>
          </div>
          <label className="field">商品・メニュー・キャンペーン情報<textarea name="product_context" rows={3} placeholder="価格、対象のお客様、予約方法、期間など。AIが投稿文へ反映します。" /></label>
          <div className="form-actions"><PendingSubmitButton pendingLabel="写真を取り込み、AIが投稿案を作成しています...">写真を取り込んで投稿案を作る</PendingSubmitButton></div>
        </form>
      </section>

      {mediaWithPreview.map((asset, assetIndex) => {
        const result = asset.result && typeof asset.result === "object" ? asset.result as { analysis?: { summary?: string; alt_text?: string; safety_flags?: unknown }; captions?: Record<string, { body?: string; short_body?: string; hashtags?: string[]; cta?: string; approval_status?: string; character_count?: number }> } : {};
        return (
          <section className="card" key={asset.id}>
            <div className="section-heading"><div><h2>{assetIndex + 2}. 写真と投稿文を確認</h2><p className="muted">{asset.original_file_name} ・ {Math.ceil(Number(asset.file_size ?? 0) / 1024)}KB</p></div><form action={archiveSnsMediaAction.bind(null, store.id, action.id, String(asset.id))}><button className="button danger" type="submit">削除</button></form></div>
            <div className="grid cols-2">
              <div>{asset.preview_url ? <Image src={asset.preview_url} alt={String(result.analysis?.alt_text ?? "投稿用画像のプレビュー")} width={720} height={540} unoptimized style={{ width: "100%", height: "auto", borderRadius: 12 }} /> : <p className="notice danger">プレビューを取得できませんでした。</p>}<p>{result.analysis?.summary ?? "AI解析結果を確認してください。"}</p>{result.analysis?.safety_flags ? <p className="notice">安全確認メモ: {JSON.stringify(result.analysis.safety_flags)}</p> : null}</div>
              <form className="form" action={approveSnsMediaAction.bind(null, store.id, action.id, String(asset.id))}>
                <h3>公開前の必須確認</h3>
                <label className="check-row"><input name="copyright_confirmed" type="checkbox" defaultChecked={Boolean(asset.copyright_confirmed)} />この写真を投稿する権利があります</label>
                <label className="check-row"><input name="person_consent_confirmed" type="checkbox" defaultChecked={Boolean(asset.person_consent_confirmed)} />写っている人物から公開の同意を得ています（人物がいない場合も確認）</label>
                <label className="check-row"><input name="privacy_confirmed" type="checkbox" defaultChecked={Boolean(asset.privacy_confirmed)} />個人情報・顧客情報・不適切な内容が写っていないことを確認しました</label>
                {SNS_CHANNELS.map((channel) => {
                  const caption = result.captions?.[channel] ?? {};
                  const label = snsChannels.find((item) => item.value === channel)?.label ?? channel;
                  return <fieldset className="card" key={channel}><legend>{label}</legend>
                    <label className="field">本文（上限 {SNS_LIMITS[channel].body}文字）<textarea name={`${channel}_body`} rows={5} defaultValue={caption.body ?? ""} /></label>
                    <label className="field">短文<input name={`${channel}_short_body`} defaultValue={caption.short_body ?? ""} /></label>
                    <label className="field">ハッシュタグ（上限 {SNS_LIMITS[channel].hashtags}個）<input name={`${channel}_hashtags`} defaultValue={(caption.hashtags ?? []).join(" ")} /></label>
                    <label className="field">行動を促す一文<input name={`${channel}_cta`} defaultValue={caption.cta ?? ""} /></label>
                    <label className="check-row"><input name={`${channel}_approved`} type="checkbox" defaultChecked={caption.approval_status === "approved"} />この文章を人が確認し、公開用として承認</label>
                  </fieldset>;
                })}
                <div className="form-actions"><PendingSubmitButton pendingLabel="確認内容を保存しています...">確認内容と承認を保存</PendingSubmitButton></div>
              </form>
            </div>
            <form className="form" action={queueSnsPublishAction.bind(null, store.id, action.id, String(asset.id))}>
              <h3>承認済みの内容を投稿</h3>
              <div className="grid cols-2"><label className="field">投稿先<select name="channel" defaultValue="instagram">{SNS_CHANNELS.map((channel) => <option key={channel} value={channel}>{snsChannels.find((item) => item.value === channel)?.label}</option>)}</select></label><label className="field">投稿日時（空欄なら今すぐ）<input name="scheduled_at" type="datetime-local" /></label></div>
              <div className="form-actions"><PendingSubmitButton disabled={asset.approval_status !== "approved"} pendingLabel="SNS投稿を準備しています...">投稿する／予約する</PendingSubmitButton></div>
              {asset.approval_status !== "approved" ? <p className="muted">先に安全確認と、投稿する媒体の文章承認を保存してください。</p> : null}
            </form>
          </section>
        );
      })}

      <section className="card" id="publish-history"><h2>投稿履歴と再実行</h2><div className="table-wrap"><table className="table"><thead><tr><th>媒体</th><th>状態</th><th>予定／実行</th><th>公開先</th><th>エラー</th><th>操作</th></tr></thead><tbody>
        {publishJobs.map((job) => { const response = job.response_json && typeof job.response_json === "object" ? job.response_json as { public_url?: string; reason?: string } : {}; return <tr key={job.id}><td>{job.channel}</td><td><span className="badge">{job.status === "sent" ? "公開済み" : job.status === "scheduled" ? "予約済み" : job.status === "manual_required" ? "手動投稿が必要" : job.status === "failed" ? "失敗" : job.status === "retry_wait" ? "再試行待ち" : job.status}</span></td><td>{job.sent_at ?? job.scheduled_at ?? "-"}</td><td>{response.public_url ? <a href={response.public_url} target="_blank" rel="noreferrer">公開ページを開く</a> : job.target_id ?? "-"}</td><td>{job.error_message ?? response.reason ?? "-"}</td><td>{["failed", "retry_wait", "ready"].includes(job.status) ? <form action={retrySnsPublishAction.bind(null, store.id, action.id, String(job.id))}><PendingSubmitButton className="button secondary" pendingLabel="再実行しています...">再実行</PendingSubmitButton></form> : "-"}</td></tr>; })}
        {publishJobs.length === 0 ? <tr><td colSpan={6}>投稿履歴はまだありません。</td></tr> : null}
      </tbody></table></div></section>

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
          <PendingSubmitButton pendingLabel="SNS投稿状態を保存しています...">SNS投稿状態を保存</PendingSubmitButton>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}/edit`}>下書きを編集</Link>
          <Link className="button secondary" href={`/stores/${store.id}/growth-actions/${action.id}`}>詳細へ戻る</Link>
        </div>
      </form>
    </AppShell>
  );
}
