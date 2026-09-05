import assert from "node:assert/strict";
import fs from "node:fs";

const homePage = fs.readFileSync("app/page.tsx", "utf8");

assert.match(homePage, /permanentRedirect\(MARKETING_SITE_URL\)/, "ルートは公式LPへ恒久転送する必要があります。");
assert.match(homePage, /const MARKETING_SITE_URL = "https:\/\/aioboost\.jp\/"/, "転送先は公式LPである必要があります。");
assert.ok(fs.existsSync("app/apply/page.tsx"), "申込ページ /apply を維持する必要があります。");
assert.ok(fs.existsSync("app/login/page.tsx"), "ログインページ /login を維持する必要があります。");
assert.ok(fs.existsSync("app/privacy/page.tsx"), "プライバシーページ /privacy を維持する必要があります。");
assert.ok(fs.existsSync("app/terms/page.tsx"), "利用規約ページ /terms を維持する必要があります。");
assert.ok(fs.existsSync("app/data-deletion/page.tsx"), "データ削除ページ /data-deletion を維持する必要があります。");

console.log("公開入口ルーティングチェック: OK");
console.log("- /: https://aioboost.jp/ へ恒久転送");
console.log("- /apply・/login・規約・データ削除ページ: 維持");
