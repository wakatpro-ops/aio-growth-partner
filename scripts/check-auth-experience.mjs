import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sendgrid = readFileSync("lib/email/sendgrid.ts", "utf8");
const loginPage = readFileSync("app/login/page.tsx", "utf8");
const forgotPassword = readFileSync("app/auth/forgot-password/forgot-password-form.tsx", "utf8");
const setPassword = readFileSync("app/auth/set-password/set-password-form.tsx", "utf8");
const applicationsPage = readFileSync("app/admin/applications/page.tsx", "utf8");
const inviteGenerator = readFileSync("lib/admin/applications.ts", "utf8");
const acceptInvitePage = readFileSync("app/auth/accept-invite/accept-invite-form.tsx", "utf8");
const acceptInviteApi = readFileSync("app/api/auth/accept-invite/route.ts", "utf8");
const sessionApi = readFileSync("app/api/auth/session/route.ts", "utf8");
const setPasswordApi = readFileSync("app/api/auth/set-password/route.ts", "utf8");

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
assert.match(inviteGenerator, /buildScannerSafeInviteUrl/u);
assert.doesNotMatch(inviteGenerator, /properties as \{ action_link/u);
assert.match(acceptInvitePage, /招待を確認してパスワード設定へ進む/u);
assert.match(acceptInvitePage, /history\.replaceState/u);
assert.match(acceptInviteApi, /verifyOtp/u);
assert.match(sessionApi, /"password_set"/u);
assert.match(setPasswordApi, /"accepted"/u);

console.log("Authentication and application-history experience checks passed.");
