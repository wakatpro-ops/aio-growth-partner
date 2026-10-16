import test from "node:test";
import assert from "node:assert/strict";
import { extractPublicMenus, searchedMenuCandidates, menuPageMatchesStore } from "../../lib/applications/menu-extraction.ts";
import { setupMenuCandidates, setupMenuReady, catalogueNeedsReview } from "../../lib/onboarding/menu-candidates.ts";
import { parseInitialSetupForm } from "../../lib/onboarding/initial-setup-rules.ts";
import { itemAvailability, validateMenuItem } from "../../lib/menu-workbench-rules.ts";

const url = "https://example.com/menu";
const jsonPage = object => ({ url, html: `<script type="application/ld+json">${JSON.stringify(object)}</script>` });
const product = (price = "1200", currency = "JPY") => ({ "@type": "MenuItem", name: "野菜のランチセット", offers: { "@type": "Offer", price, priceCurrency: currency, valueAddedTaxIncluded: true } });
test("商品名・円価格・税・出典をJSON-LDから同じ組で取得し、特徴を商品にしない", () => {
  const menus = extractPublicMenus([jsonPage({ "@graph": [product(), { "@type": "Service", name: "個室利用" }, { "@type": "Restaurant", name: "架空カフェ", priceRange: "1000〜3000円" }] })]);
  assert.equal(menus.length, 1);
  assert.equal(menus[0].name, "野菜のランチセット"); assert.equal(menus[0].unitPrice, 1200);
  assert.equal(menus[0].taxInclusion, "inclusive"); assert.equal(menus[0].sourceUrl, url); assert.equal(menus[0].sourceAccess, "page");
});
test("価格なし・別通貨・価格帯・NaN・小数・負数を円単価にしない", () => {
  for (const value of [null, "", "時価", "1200〜2000", "NaN", -1, 1.5, "100000001"]) assert.equal(extractPublicMenus([jsonPage(product(value))]).length, 0);
  assert.equal(extractPublicMenus([jsonPage(product(12, "USD"))]).length, 0);
  assert.equal(extractPublicMenus([jsonPage({ ...product(), offers: { price: 1200, priceCurrency: "JPY", lowPrice: 1000 } })]).length, 0);
});
test("明示的な無料と価格不明は区別する", () => {
  assert.equal(extractPublicMenus([jsonPage(product(0))])[0].unitPrice, 0);
  const candidates = setupMenuCandidates({ services: ["ランチ", "ディナー", "個室利用"] });
  assert(candidates.every(menu => menu.unitPrice === null && menu.kind === "overview"));
});
test("表の行・dt/ddで対応する価格だけを読む。税区分を推測しない", () => {
  const menus = extractPublicMenus([{ url, html: '<table><tr><th>野菜スープ</th><td>1,200円（税込）</td></tr><tr><th>平均予算</th><td>3000円</td></tr></table><dl><dt>カット</dt><dd>5500円</dd><dt>カラー</dt><dd>5000円〜</dd><dt>コース</dt><dd>4000円/6000円</dd></dl>' }]);
  assert.deepEqual(menus.map(item => [item.name, item.unitPrice, item.taxInclusion]), [["野菜スープ", 1200, "inclusive"], ["カット", 5500, "unknown"]]);
});
test("同じ商品の異なる単価は勝手に一方を採用しない", () => {
  assert.equal(extractPublicMenus([jsonPage([product(1200), product(1300)])]).length, 0);
  assert.equal(extractPublicMenus([jsonPage([product(1200), product(1200)])]).length, 1);
});
test("別店舗や同名別地域のページを公式メニューとして利用しない", () => {
  const store = { store_name: "架空カフェ", address: "東京都港区六本木1", phone: "03-0000-1111" };
  const page = { title: "架空カフェ", description: "東京都港区六本木1", html: "" };
  assert(menuPageMatchesStore(page, store));
  assert(!menuPageMatchesStore({ ...page, description: "長野県長野市" }, store));
  assert(!menuPageMatchesStore({ ...page, title: "無関係な店" }, store));
  assert(!menuPageMatchesStore({ ...page, html: "TEL 03-9999-9999" }, store));
  assert(!menuPageMatchesStore({ ...page, description: "東京都港区赤坂1" }, { ...store, phone: "" }));
});
test("検索候補はツール検証済みURL・商品名と価格の根拠がある場合のみ。自動確定しない", () => {
  const row = { name: "野菜セット", unitPrice: 1200, taxInclusion: "inclusive", sourceUrl: url, evidence: "野菜セット 1,200円（税込）" };
  const valid = searchedMenuCandidates([row], [{ url }]); assert.equal(valid[0].sourceAccess, "search");
  assert.equal(searchedMenuCandidates([{ ...row, sourceUrl: "https://unverified.invalid/" }], [{ url }]).length, 0);
  assert.equal(searchedMenuCandidates([{ ...row, unitPrice: 2000 }], [{ url }]).length, 0);
  assert.equal(searchedMenuCandidates([{ ...row, evidence: "ディナー 1200円" }], [{ url }]).length, 0);
  assert.equal(searchedMenuCandidates([{ ...row, evidence: "野菜セット 平均予算1200円" }], [{ url }]).length, 0);
  assert.equal(searchedMenuCandidates([row, { ...row, unitPrice: 2000, evidence: "野菜セット 2000円" }], [{ url }]).length, 0);
  assert.equal(searchedMenuCandidates([{ ...row, name: "個室利用", evidence: "個室利用", unitPrice: null }], [{ url }]).length, 0);
});
test("商品候補と特徴を区別し全角・空白・大小文字の重複と危険な出典を除く", () => {
  const candidates = setupMenuCandidates({ menu_candidates: [extractPublicMenus([jsonPage(product())])[0], { name: "危険", unitPrice: 1, evidence: "危険", sourceUrl: "javascript:alert(1)" }], services: ["野菜のランチセット", "ランチ", "Ｌｕｎｃｈ", "lunch"] });
  assert.deepEqual(candidates.map(item => item.kind), ["menu", "overview", "overview"]);
});
function form() {
  const f = new FormData();
  for (const [key, value] of Object.entries({ final_confirmation: "on", store_name: "架空カフェ", industry_type_key: "restaurant", invoice_issuer_name: "架空法人", invoice_prefix: "INV", menu_enabled_0: "on", menu_name_0: "野菜セット", menu_unit_price_0: "1200", menu_tax_inclusion_0: "inclusive", menu_confirmed_0: "on" })) f.set(key, value);
  return f;
}
test("最終承認だけでは価格未確認・未入力・無料を登録できない。改変POSTも拒否", () => {
  for (const mutate of [f => f.delete("menu_confirmed_0"), f => f.set("menu_unit_price_0", ""), f => f.set("menu_unit_price_0", "0"), f => f.set("menu_tax_inclusion_0", "unknown")]) {
    const f = form(); mutate(f); assert.throws(() => parseInitialSetupForm(f, "snapshot", 1), /確認/);
  }
  const f = form(); f.set("menu_unit_price_0", "0"); f.set("menu_free_confirmed_0", "on");
  assert.equal(parseInitialSetupForm(f, "snapshot", 1).menus[0].unitPrice, 0);
});
test("途中保存は不完全でも保持。未選択・価格不明のまま利用開始もできる", () => {
  const f = form(); f.set("menu_unit_price_0", ""); f.delete("menu_confirmed_0");
  assert.equal(parseInitialSetupForm(f, "snapshot", 1, undefined, true).menus[0].unitPrice, null);
  f.delete("menu_enabled_0"); assert.equal(parseInitialSetupForm(f, "snapshot", 1).menus[0].enabled, false);
});
test("旧0円初期設定は要確認、手動無料・再確認済み無料・正規価格は維持", () => {
  const legacy = { status: "active", unit_price: 0, metadata: { initial_setup_candidate: true } };
  assert(catalogueNeedsReview(legacy)); assert.equal(itemAvailability(legacy), "needs_review");
  assert(!catalogueNeedsReview({ unit_price: 0, metadata: {} }));
  assert(!catalogueNeedsReview({ ...legacy, metadata: { ...legacy.metadata, price_confirmed: true } }));
  assert(!catalogueNeedsReview({ ...legacy, unit_price: 1200 }));
  assert(catalogueNeedsReview({ unit_price: 1200, metadata: { catalogue_review_required: true } }));
});
test("候補は個別確認と有効な円価格・税区分が必要。空の手動価格も拒否", () => {
  assert(!setupMenuReady({ name: "セット", unitPrice: null, confirmed: true, taxInclusion: "inclusive" }));
  assert(!setupMenuReady({ name: "セット", unitPrice: 1200, confirmed: true, taxInclusion: "unknown" }));
  assert(setupMenuReady({ name: "セット", unitPrice: 1200, confirmed: true, taxInclusion: "inclusive" }));
  const f = new FormData(); f.set("unit_price", ""); assert.throws(() => validateMenuItem(f), /価格/);
});
