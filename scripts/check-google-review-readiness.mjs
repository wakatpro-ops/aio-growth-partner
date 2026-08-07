import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];

const legalFiles = [
  "lib/legal/content.ts",
  "app/legal/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx"
];
const legalText = legalFiles.map(read).join("\n");
const placeholders = ["[会社名]", "[所在地]", "[代表者名]", "[問い合わせメール]", "[制定日]", "[改定日]", "プレースホルダー"];

for (const placeholder of placeholders) {
  if (legalText.includes(placeholder)) failures.push(`公開法務ページに未確定表記が残っています: ${placeholder}`);
}

for (const value of [
  "株式会社 Navi Life",
  "東京都杉並区梅里二丁目35番13号",
  "代表取締役 中堀 茂",
  "info@aioboost.jp",
  "https://aioboost.jp/",
  "Google連携の解除とデータ削除"
]) {
  if (!legalText.includes(value)) failures.push(`Google審査に必要な公開情報が見つかりません: ${value}`);
}

const googleSource = read("lib/phase5/google-integrations.ts");
const productionScopes = googleSource.match(/GOOGLE_PRODUCTION_REVIEW_SCOPES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1] ?? "";

if (!productionScopes.includes("business.manage")) failures.push("本番審査用スコープに business.manage がありません。");
if (productionScopes.includes("gmail.compose")) failures.push("本番審査用スコープに制限付き gmail.compose が含まれています。");
if (productionScopes.includes("calendar.events")) failures.push("初回本番審査用スコープに calendar.events が含まれています。");
if (!googleSource.includes("https://oauth2.googleapis.com/revoke")) failures.push("Google OAuth権限取消処理がありません。");
if (!googleSource.includes("access_token_encrypted: null")) failures.push("Google連携解除時のアクセストークン削除処理がありません。");
if (!googleSource.includes("refresh_token_encrypted: null")) failures.push("Google連携解除時の保存トークン削除処理がありません。");

const googleSettingsPage = read("app/stores/[storeId]/settings/google/page.tsx");
const disconnectAction = read("app/stores/[storeId]/growth-actions/actions.ts");
if (!googleSettingsPage.includes("ConfirmSubmitButton")) failures.push("Google連携解除の確認操作がありません。");
if (!googleSettingsPage.includes("審査準備中")) failures.push("未承認のGoogle機能を審査準備中として区別できません。");
if (!googleSettingsPage.includes("disconnected=1") && !disconnectAction.includes("disconnected=1")) {
  failures.push("Google連携解除後の完了表示がありません。");
}

if (failures.length) {
  console.error("Google審査準備チェックに失敗しました。\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Google審査準備チェック: OK");
console.log("- 運営会社・問い合わせ先・規約情報: 確認済み");
console.log("- 初回本番スコープ: business.manage + 基本プロフィールのみ");
console.log("- Google連携解除・保存トークン削除: 実装済み");
