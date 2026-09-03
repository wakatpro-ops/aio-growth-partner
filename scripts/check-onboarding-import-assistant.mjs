import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
const assistant = readFileSync("components/store-ai/store-ai-assistant.tsx", "utf8");
const route = readFileSync("app/api/stores/[storeId]/assistant/route.ts", "utf8");
const service = readFileSync("lib/store-ai/assistant.ts", "utf8");
const setup = readFileSync("app/onboarding/setup-review/initial-setup-review-form.tsx", "utf8");
const initialSetup = readFileSync("lib/onboarding/initial-setup.ts", "utf8");
const importPage = readFileSync("app/stores/[storeId]/data-imports/ai/page.tsx", "utf8");
const importDetail = readFileSync("app/stores/[storeId]/data-imports/ai/[jobId]/page.tsx", "utf8");
const importActions = readFileSync("app/stores/[storeId]/data-imports/ai/actions.ts", "utf8");

assert.doesNotMatch(shell, /label: "データ取り込み"/u, "データ取り込みは独立した主要メニューにしないでください。");
assert.match(shell, /label: "設定"/u);
assert.match(shell, /nav-ai-button[\s\S]*AIに尋ねる/u);
assert.match(assistant, /データ変更・削除・外部送信はしません/u);
assert.match(route, /getStoreForApi/u);
assert.doesNotMatch(route, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/u);
assert.match(service, /説明と相談だけを行い/u);
assert.match(service, /秘密情報、他店舗、内部設定、権限外データは答えない/u);
assert.ok(setup.indexOf("<DataImportQuestion") < setup.indexOf("<MenuQuestion"), "既存データの確認はメニューの個別確認より先にしてください。");
for (const label of ["ファイルを取り込む", "手入力で進める", "後で取り込む", "売上", "経費", "顧客", "商品・メニュー", "在庫"]) assert.match(setup, new RegExp(label));
assert.match(initialSetup, /listUnifiedImportJobs/u);
assert.match(initialSetup, /getUnifiedImportJob/u);
assert.match(initialSetup, /existingNames/u);
assert.match(importPage, /初回設定へ戻る/u);
assert.match(importPage, /uploadUnifiedImportAction\.bind\(null, store\.id, onboarding\)/u);
assert.match(importDetail, /初回設定の続きを開く/u);
assert.match(importActions, /requireStoreActionWriteAccess/u);
assert.match(importActions, /onboarding=1/u);

console.log("Onboarding import and store AI assistant checks passed.");
