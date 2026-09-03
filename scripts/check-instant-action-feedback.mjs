import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const pendingButton = read("components/ui/pending-submit-button.tsx");
const confirmButton = read("components/ui/confirm-submit-button.tsx");
const login = read("app/login/login-form.tsx");
const setPassword = read("app/auth/set-password/set-password-form.tsx");
const aiGenerator = read("components/ai/ai-generator.tsx");
const storeAssistant = read("components/store-ai/store-ai-assistant.tsx");
const diagnosis = read("app/apply/diagnosis/diagnosis-client.tsx");
const applicationAdmin = read("app/admin/applications/[applicationId]/page.tsx");
const snsPost = read("app/stores/[storeId]/growth-actions/[actionId]/sns-post/page.tsx");

assert.match(pendingButton, /const \[clicked, setClicked\]/u);
assert.match(pendingButton, /onClick=\{lockImmediately\}/u);
assert.match(pendingButton, /aria-busy=\{isBusy\}/u);
assert.match(pendingButton, /disabled=\{disabled \|\| pending \|\| busy\}/u);
assert.match(pendingButton, /aria-disabled=\{isBusy\}/u);
assert.doesNotMatch(pendingButton, /disabled=\{disabled \|\| isBusy\}/u);
assert.match(confirmButton, /aria-busy=\{confirmed \|\| pending\}/u);

assert.match(login, /onSubmit=\{submit\}/u);
assert.doesNotMatch(login, /action=\{submit\}/u);
assert.match(login, /busy=\{loading\}/u);
assert.match(login, /利用できる店舗を確認しています/u);
assert.match(setPassword, /onSubmit=\{submit\}/u);
assert.match(aiGenerator, /PendingSubmitButton/u);
assert.match(storeAssistant, /AIが回答を考えています/u);
assert.match(diagnosis, /正式申込を送信しています/u);
assert.match(applicationAdmin, /案内メールを送信しています/u);
assert.match(snsPost, /SNS投稿を準備しています/u);

console.log("Instant action feedback checks passed.");
