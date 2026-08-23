import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sendgrid = readFileSync("lib/email/sendgrid.ts", "utf8");
const loginPage = readFileSync("app/login/page.tsx", "utf8");
const forgotPassword = readFileSync("app/auth/forgot-password/forgot-password-form.tsx", "utf8");
const setPassword = readFileSync("app/auth/set-password/set-password-form.tsx", "utf8");
const applicationsPage = readFileSync("app/admin/applications/page.tsx", "utf8");

assert.match(sendgrid, /fromName: "AIO boost"/u);
assert.doesNotMatch(sendgrid, /fromName: envValue\("SENDGRID_FROM_NAME"\)/u);
assert.match(loginPage, /パスワードを忘れた方/u);
assert.match(loginPage, /\/auth\/forgot-password/u);
assert.match(forgotPassword, /resetPasswordForEmail/u);
assert.match(forgotPassword, /入力したメールアドレスが登録済みの場合/u);
assert.match(setPassword, /mode.*recovery/u);
assert.match(applicationsPage, /店舗・顧客データとは別に保存されます/u);
assert.match(applicationsPage, /登録店舗ではなく申込履歴です/u);
assert.match(applicationsPage, /申込対象店舗/u);

console.log("Authentication and application-history experience checks passed.");
