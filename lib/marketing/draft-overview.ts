import type { GrowthAction } from "@/types/phase5";

// Include prepared actions regardless of whether AI, a person, or the conversation created them.
export function growthDraftOverview(actions: GrowthAction[], storeId: string) {
  return actions.filter(action => !action.archived_at && action.store_id === storeId &&
    ["drafted", "pending_approval", "approved", "rejected", "paused", "done"].includes(action.status))
    .map(action => ({
      id: action.id, created_at: action.created_at, channel: action.target_channel, title: action.title,
      // Finishing an action is not evidence of external publication.
      status: action.published_at ? "published" : action.status === "approved" ? "approved" : action.status === "done" ? "completed" : "draft",
      body: action.drafts?.[0]?.body ?? action.summary, short_body: "",
      href: `/stores/${storeId}/growth-actions/${action.id}`
    }));
}
