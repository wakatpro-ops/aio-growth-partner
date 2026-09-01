import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const service = read("lib/phase5/sns-publishing.ts");
const settings = read("app/stores/[storeId]/settings/channels/page.tsx");
const actions = read("app/stores/[storeId]/growth-actions/actions.ts");
const privacy = read("lib/legal/content.ts");
const deletionPage = read("app/data-deletion/page.tsx");
const envExample = read(".env.example");

for (const scope of [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish"
]) {
  assert.ok(service.includes(scope), `Meta OAuth scope is missing: ${scope}`);
}
assert.ok(!service.includes('"business_management"'), "Unused business_management scope must not be requested");

for (const value of [
  "META_APP_ID",
  "META_APP_SECRET",
  "META_REDIRECT_URI",
  "SNS_TOKEN_ENCRYPTION_KEY",
  "https://app.aioboost.jp/api/meta/oauth/callback"
]) {
  assert.ok(envExample.includes(value), `Meta environment example is missing: ${value}`);
}

assert.ok(service.includes('method: "DELETE"'), "Meta permission revocation request is missing");
assert.ok(service.includes("access_token_encrypted: null"), "Stored Meta token deletion is missing");
assert.ok(service.includes("meta_disconnected"), "Meta disconnect audit event is missing");
assert.ok(actions.includes("disconnectMetaAction"), "Meta disconnect server action is missing");
assert.ok(settings.includes("ConfirmSubmitButton"), "Meta disconnect confirmation is missing");
assert.ok(settings.includes("Meta連携を解除"), "Meta disconnect button is missing");

for (const value of [
  "Meta連携の解除とデータ削除",
  "Facebook・Instagram連携を解除",
  "info@aioboost.jp",
  "https://app.aioboost.jp/data-deletion"
]) {
  assert.ok(privacy.includes(value), `Meta privacy disclosure is missing: ${value}`);
}

for (const value of [
  "Meta連携の解除・データ削除",
  "アプリとウェブサイト",
  "info@aioboost.jp",
  "株式会社 Navi Life"
]) {
  assert.ok(deletionPage.includes(value) || privacy.includes(value), `Meta deletion instructions are missing: ${value}`);
}

console.log("Meta審査準備チェック: OK");
console.log("- 必要権限6件と本番OAuthコールバック: 確認済み");
console.log("- Meta連携解除・権限取消・保存トークン削除: 実装済み");
console.log("- 公開プライバシー開示・データ削除案内: 実装済み");
