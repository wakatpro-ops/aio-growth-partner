import assert from "node:assert/strict";
import { test } from "node:test";
import { growthDraftOverview } from "../../lib/marketing/draft-overview.ts";

const action = { id: "draft-1", store_id: "store", created_at: "2026-10-04", target_channel: "instagram", title: "Demo", summary: "Body", status: "drafted", source_type: "manual", archived_at: null };
test("manual, prior AI, and conversation drafts all appear in the same overview", () => {
  for (const source_type of ["manual", "ai_growth_action", "guided_conversation", "review_demo", null]) {
    const result = growthDraftOverview([{ ...action, source_type }], "store");
    assert.equal(result.length, 1);
    assert.equal(result[0].href, "/stores/store/growth-actions/draft-1");
    assert.equal(result[0].status, "draft");
  }
});
test("archived, other-store and unprepared suggestions are excluded", () => {
  assert.deepEqual(growthDraftOverview([{ ...action, archived_at: "2026-10-04" }, { ...action, store_id: "other" }, { ...action, status: "todo" }], "store"), []);
});
test("completion alone never implies publication", () => {
  assert.equal(growthDraftOverview([{ ...action, status: "done" }], "store")[0].status, "completed");
  assert.equal(growthDraftOverview([{ ...action, status: "done", published_at: "2026-10-04" }], "store")[0].status, "published");
});
