import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { aioOffersFor, parseAioDraft } from "../../lib/marketing/aio-conversation-rules.ts";
import { chooseOffer } from "../../lib/marketing/conversation-rules.ts";
test("AIO priorities use missing information; overdue work precedes weighted choices", () => {
  const facts = { missing: ["offering"], activeTasks: [], hasGoal: false };
  assert.equal(chooseOffer(aioOffersFor("store", facts, "2026-10-05")).id, "service");
  const offers = aioOffersFor("store", { ...facts, activeTasks: [{ id: "task", title: "確認", due_date: "2026-10-01" }] }, "2026-10-05");
  for (let i=0;i<100;i++) assert.equal(chooseOffer(offers, {}, 1, String(i)).id, "continue");
  assert.equal(offers[0].href, "/stores/store/marketing/aio-improvement/tasks/task");
  assert(offers.some(offer => offer.channel === "aio_questions"));
  assert.equal(chooseOffer(offers, { continue: 10 }, 5).id, "service");
});
test("AIO draft validation bounds text and questions without applying them", () => {
  assert.equal(parseAioDraft("  紹介文  ", false), "紹介文");
  assert.equal(parseAioDraft("質問1\n\n質問2", true), "質問1\n質問2");
  for (const input of ["", "a".repeat(2001)]) assert.throws(() => parseAioDraft(input, false));
  for (const input of ["a".repeat(161), "1\n2\n3\n4"]) assert.throws(() => parseAioDraft(input, true));
});
test("bulky AIO tools start collapsed; deep links and editor remain usable", () => {
  const page = readFileSync("app/stores/[storeId]/marketing/aio-improvement/page.tsx", "utf8");
  const start = page.indexOf("<AioFunctionList"), end = page.indexOf("</AioFunctionList>");
  for (const text of ["見つけられ方・根拠・成果", 'id="questions"', "古い・未公開・期限超過", 'id="rediagnosis"']) assert(page.indexOf(text) > start && page.indexOf(text) < end);
  const details = readFileSync("components/marketing/aio-function-list.tsx", "utf8");
  assert(!details.includes("open={true}")); assert(details.includes("hashchange"));
  const migration = readFileSync("supabase/migrations/202610040003_aio_conversation.sql", "utf8");
  assert(migration.includes("for update")); assert(migration.includes("menu_actor_allowed")); assert(migration.includes("from public,anon,authenticated"));
  assert(!/insert into public\.(growth_actions|external_publish_jobs|aio_goals)/.test(migration));
});
