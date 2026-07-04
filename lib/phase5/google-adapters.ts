import "server-only";
import type { GrowthAction, GrowthActionDraft } from "@/types/phase5";

export type GooglePublishTarget = "google_business_profile" | "gmail" | "google_calendar";

export const googlePublishTargets: Array<{
  key: GooglePublishTarget;
  label: string;
  provider: string;
  note: string;
}> = [
  {
    key: "google_business_profile",
    label: "Googleビジネスプロフィール投稿",
    provider: "google_business_profile",
    note: "Google検索・マップに出す投稿の準備です。Phase 5-Cでは実投稿は行いません。"
  },
  {
    key: "gmail",
    label: "Gmail下書き",
    provider: "gmail",
    note: "既存顧客への案内メール下書き作成に使う準備です。Phase 5-Cでは実送信は行いません。"
  },
  {
    key: "google_calendar",
    label: "Googleカレンダー予定",
    provider: "google_calendar",
    note: "投稿・配信・点検案内などの実行予定を作る準備です。Phase 5-Cでは予定作成は行いません。"
  }
];

function draftBody(draft: GrowthActionDraft | undefined) {
  if (!draft) return "";
  return [draft.body, draft.hashtags?.join(" "), draft.call_to_action].filter(Boolean).join("\n\n");
}

export function buildGooglePreparationPayload(
  target: GooglePublishTarget,
  action: GrowthAction,
  scheduledAt: string | null
) {
  const draft = action.drafts?.[0];
  const base = {
    action_id: action.id,
    title: draft?.title ?? action.title,
    body: draftBody(draft),
    short_body: draft?.short_body ?? action.summary,
    call_to_action: draft?.call_to_action ?? null,
    scheduled_at: scheduledAt,
    source_channel: action.target_channel
  };

  if (target === "gmail") {
    return {
      ...base,
      subject: draft?.title ?? action.title,
      body_text: draftBody(draft),
      draft_mode: true
    };
  }

  if (target === "google_calendar") {
    return {
      ...base,
      event_title: action.title,
      description: draftBody(draft),
      start_at: scheduledAt,
      draft_mode: true
    };
  }

  return {
    ...base,
    post_type: "standard",
    summary: draftBody(draft),
    draft_mode: true
  };
}
