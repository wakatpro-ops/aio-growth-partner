import Link from "next/link";
import { AiGenerator } from "@/components/ai/ai-generator";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getIndustryConfig } from "@/config/industries";
import { getGoogleIntegrationState } from "@/lib/phase5/google-integrations";
import { getStore } from "@/lib/stores";
import {
  approveGoogleReviewReplyAction,
  publishGoogleReviewReplyAction,
  saveGoogleReviewReplyDraftAction,
  syncGoogleBusinessReviewsAction
} from "../growth-actions/actions";

const ratingLabels: Record<string, string> = {
  ONE: "★☆☆☆☆", TWO: "★★☆☆☆", THREE: "★★★☆☆", FOUR: "★★★★☆", FIVE: "★★★★★"
};

const replyStatusLabels: Record<string, string> = {
  not_started: "未作成", draft: "下書き", pending_approval: "承認待ち", approved: "承認済み", published: "返信済み", error: "要再確認"
};

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

export default async function ReviewsPage({
  params,
  searchParams
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ error?: string; synced?: string; count?: string; saved?: string; approved?: string; published?: string }>;
}) {
  const { storeId } = await params;
  const notices = await searchParams;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const state = await getGoogleIntegrationState(store.id);
  const selectedLocation = state.locations.find((item) => item.is_selected) ?? null;
  const gbpMetadata = state.businessProfile?.metadata ?? {};
  const gbpApiAllowed = process.env.GOOGLE_BUSINESS_PROFILE_API_STATUS === "approved" || state.businessProfile?.status === "approved" || gbpMetadata.api_status === "approved" || gbpMetadata.api_application_result === "approved";

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="Google口コミ・返信" description="Google口コミを店舗ごとに取り込み、下書き・承認・返信まで安全に管理します。" />
      <StoreBusinessNav store={store} />
      {notices.synced ? <p className="notice success">Google口コミを{notices.count ?? "0"}件同期しました。</p> : null}
      {notices.saved ? <p className="notice success">返信下書きを保存しました。</p> : null}
      {notices.approved ? <p className="notice success">返信を承認しました。公開ボタンを押すまでGoogleには反映されません。</p> : null}
      {notices.published ? <p className="notice success">承認済み返信をGoogleへ反映しました。</p> : null}
      {notices.error ? <p className="notice danger">{decodeURIComponent(notices.error)}</p> : null}

      <section className="card">
        <h2>Google口コミを同期</h2>
        <p>対象店舗: <strong>{selectedLocation?.title ?? "未選択"}</strong></p>
        <p className="muted">Googleから取得した候補のうち、設定画面で明示選択した1店舗だけを同期します。</p>
        {!gbpApiAllowed ? <p className="notice">Google Business Profile APIの利用承認後に口コミ同期を開始できます。</p> : null}
        <div className="form-actions">
          <form action={syncGoogleBusinessReviewsAction.bind(null, store.id)}>
            <PendingSubmitButton pendingLabel="Google口コミを取得しています..." disabled={!selectedLocation || !gbpApiAllowed}>Google口コミを更新</PendingSubmitButton>
          </form>
          <Link className="button secondary" href={`/stores/${store.id}/settings/google/business-profile`}>投稿先店舗を確認</Link>
        </div>
      </section>

      <section className="card">
        <h2>取得済み口コミ</h2>
        {state.reviews.length ? (
          <div className="stack">
            {state.reviews.map((review) => (
              <article className="card" key={review.id}>
                <div className="grid cols-3">
                  <p><strong>{review.reviewer_name ?? "匿名"}</strong></p>
                  <p aria-label={`評価 ${review.star_rating ?? "不明"}`}>{ratingLabels[review.star_rating ?? ""] ?? review.star_rating ?? "評価なし"}</p>
                  <p><span className="badge">{replyStatusLabels[review.reply_status] ?? review.reply_status}</span></p>
                </div>
                <p>{review.comment || "本文のない評価です。"}</p>
                <p className="muted">更新: {dateTime(review.google_updated_at)}</p>
                {review.google_reply_text ? <p className="notice success">Google掲載中の返信: {review.google_reply_text}</p> : null}
                {review.last_error ? <p className="notice danger">{review.last_error}</p> : null}

                <form className="form" action={saveGoogleReviewReplyDraftAction.bind(null, store.id, review.id)}>
                  <label className="field">返信下書き
                    <textarea name="reply_draft" rows={5} defaultValue={review.reply_draft ?? review.google_reply_text ?? ""} placeholder="お客様への返信を入力してください" required />
                  </label>
                  <label className="field checkbox-row">
                    <input name="submit_for_approval" type="checkbox" value="1" />
                    保存後、承認待ちにする
                  </label>
                  <PendingSubmitButton pendingLabel="返信下書きを保存しています...">返信下書きを保存</PendingSubmitButton>
                </form>

                <div className="form-actions">
                  {(review.reply_status === "draft" || review.reply_status === "pending_approval") ? (
                    <form action={approveGoogleReviewReplyAction.bind(null, store.id, review.id)}>
                      <PendingSubmitButton pendingLabel="承認しています...">この返信を承認</PendingSubmitButton>
                    </form>
                  ) : null}
                  {review.reply_status === "approved" || review.reply_status === "error" ? (
                    <form action={publishGoogleReviewReplyAction.bind(null, store.id, review.id)}>
                      <PendingSubmitButton pendingLabel="Googleへ反映しています...">承認済み返信をGoogleへ反映</PendingSubmitButton>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="muted">Googleから同期した口コミはまだありません。</p>}
      </section>

      <section className="card">
        <h2>AI返信案を個別に作る</h2>
        <p className="muted">口コミ本文を貼り付けて返信案を作れます。内容を確認してから、上の返信下書きへコピーしてください。</p>
        <AiGenerator
          endpoint="/api/ai/review-reply"
          storeId={store.id}
          title={industry.reviewLabel}
          fields={[
            { key: "rating", label: "評価", type: "number", placeholder: "5" },
            { key: "review_text", label: "クチコミ本文", type: "textarea", placeholder: "お客様のクチコミ本文" },
            { key: "tone", label: "返信トーン", placeholder: "丁寧で温かく" }
          ]}
        />
      </section>
    </AppShell>
  );
}
