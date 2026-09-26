import test from "node:test";
import assert from "node:assert/strict";
import { googleBusinessApiApproved, fetchGoogleBusinessPages } from "../../lib/phase5/google-business-policy.ts";

test("project approval overrides obsolete rejected metadata, not store selection", () => {
  assert.equal(googleBusinessApiApproved({status:"manual_mode", metadata:{api_status:"rejected"}}, "approved"), true);
  assert.equal(googleBusinessApiApproved(null, "approved"), true);
  assert.equal(googleBusinessApiApproved({status:"approved"}, "pending"), false);
  assert.equal(googleBusinessApiApproved(null, ""), false);
});
const response = (data, status = 200) => new Response(JSON.stringify(data), {status});
const endpoint = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20";
const describe = () => "Google取得エラー";
test("all pages are loaded with no-store, timeout and same auth", async () => {
  let calls = 0;
  const result = await fetchGoogleBusinessPages(endpoint, "accounts", "synthetic", 10, describe, async (url, options) => {
    assert.equal(options.headers.authorization, "Bearer synthetic");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    if (++calls === 1) return response({accounts:[{name:"accounts/1"}],nextPageToken:"next"});
    assert.equal(new URL(url).searchParams.get("pageToken"), "next");
    return response({accounts:[{name:"accounts/2"}]});
  });
  assert.equal(result.length, 2);
});
for (const status of [401, 403, 429, 500]) test(`HTTP ${status} on a later page never returns partial results`, async () => {
  let calls = 0;
  await assert.rejects(fetchGoogleBusinessPages(endpoint, "accounts", "synthetic", 10, describe, async () =>
    ++calls === 1 ? response({accounts:[{name:"accounts/1"}],nextPageToken:"next"}) : response({}, status)), /Google取得エラー/);
});
test("empty complete list is valid", async () => assert.deepEqual(await fetchGoogleBusinessPages(endpoint,"accounts","synthetic",10,describe,async()=>response({})), []));
test("repeated tokens and page limit fail closed", async () => {
  const request = async () => response({accounts:[],nextPageToken:"next"});
  await assert.rejects(fetchGoogleBusinessPages(endpoint,"accounts","synthetic",10,describe,request), /繰り返/);
  await assert.rejects(fetchGoogleBusinessPages(endpoint,"accounts","synthetic",1,describe,request), /上限/);
});
test("malformed collection never clears cached candidates", async () => {
  for (const accounts of [{}, [null], [{id:"missing-name"}]]) {
    await assert.rejects(fetchGoogleBusinessPages(endpoint,"accounts","synthetic",10,describe,async()=>response({accounts})), /応答形式/);
  }
});
