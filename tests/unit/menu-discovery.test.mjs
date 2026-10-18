import test from "node:test";
import assert from "node:assert/strict";
import { discoverStoreMenus, discoverLinkedMenuUrls, mergePublicMenuCandidates, publicMenuUrl, sameMenuListing } from "../../lib/applications/menu-discovery.ts";
import { extractPublicMenus } from "../../lib/applications/menu-extraction.ts";
import { fetchPublicStorePage, PublicUrlError } from "../../lib/applications/url-safety.ts";
import { normalizeDiagnosisSources } from "../../lib/applications/public-diagnosis.ts";
import { publicAnalysisPreview } from "../../lib/applications/analysis-presentation.ts";
import { setupMenuCandidates, setupMenuReady } from "../../lib/onboarding/menu-candidates.ts";

const root = "https://tabelog.com/tokyo/A0000/A000000/12345678/";
const food = `${root}dtlmenu/`;
const other = "https://tabelog.com/tokyo/A0000/A000000/87654321/dtlmenu/";
const store = { store_name: "架空カフェ", address: "東京都港区六本木1-2-3", phone: "03-0000-1111" };
const source = url => ({ url, label: "公開ページ", kind: "portal", access: "search" });
const menu = (sourceUrl = food, unitPrice = 1200) => ({ name: "有機野菜のランチセット", unitPrice, taxInclusion: "inclusive", sourceUrl, sourceAccess: "search", evidence: `有機野菜のランチセット ${unitPrice?.toLocaleString("ja-JP") ?? "価格不明"}円（税込）` });
const page = (url = food) => ({ url, title: store.store_name, description: "", html: `<h1>${store.store_name}</h1><h3>料理</h3><h4>有機野菜のランチセット</h4><p>国産野菜を使用</p><p>1,200円（税込）</p><h4>価格が変わるコース</h4><p>3,000円～</p><footer>${store.address} TEL ${store.phone}</footer>` });
const input = (overrides = {}) => ({ store, sourceUrl: root, pages: [], sources: [source(root)], menus: [], excluded: [], ...overrides });
const researchPage = (url = food, overrides = {}) => ({ url, ...store, identity_evidence: `${store.store_name} ${store.address} ${store.phone}`, ...overrides });
const researchResult = (overrides = {}) => ({ menu_pages: [researchPage()], menu_candidates: [menu()], sources: [source(food)], ...overrides });
const refuseRead = async () => { throw new PublicUrlError("http_403", "blocked"); };

test("トップURLだけで商品0件でも、メニュー専用の追加調査で価格付き候補を回収する", async () => {
  let searches = 0, reads = 0;
  const result = await discoverStoreMenus(input(), { research: async timeout => { searches++; assert(timeout <= 35000); return researchResult(); }, fetchPage: async () => { reads++; return refuseRead(); } });
  assert.equal(searches, 1); assert.equal(reads, 1);
  assert.equal(result.menus[0].unitPrice, 1200); assert.equal(result.menus[0].sourceAccess, "search");
  assert.equal(result.summary.status, "found");
  assert(setupMenuCandidates({ menu_candidates: result.menus }).every(candidate => !setupMenuReady(candidate)));
});

test("本文の実リンクから料金ページを読む。価格が取れれば追加AIは使わない", async () => {
  const official = "https://cafe.example/menu";
  const start = { ...page("https://cafe.example/"), html: '<a href="/menu">料理と料金</a><a href="/access">アクセス</a>' };
  const result = await discoverStoreMenus(input({ sourceUrl: start.url, pages: [start], sources: [source(start.url)] }), {
    fetchPage: async url => { assert.equal(url, official); return page(url); }, research: async () => assert.fail("No unnecessary AI search")
  });
  assert.equal(result.summary.searched, false); assert.equal(result.summary.pagesRead, 1);
  assert.equal(result.menus[0].sourceAccess, "page"); assert.equal(result.menus[0].name, "有機野菜のランチセット");
});

test("メニューページURLを推測しない・他店舗のリンクや予約操作を辿らない", () => {
  const start = { ...page(root), html: `<a href="${food}">料理</a><a href="${other}">隣店のメニュー</a><a href="https://unknown.example/menu">別サイト</a><a href="${root}reservation/">予約メニュー</a>` };
  assert.deepEqual(discoverLinkedMenuUrls([start], [root]), [food]);
  assert.deepEqual(discoverLinkedMenuUrls([{ ...start, html: "メニューは近日公開" }], [root]), []);
});

test("ポータルは同じドメインではなく店舗IDで照合する（飲食・美容）", () => {
  assert(sameMenuListing(root, food)); assert(!sameMenuListing(root, other));
  assert(sameMenuListing("https://www.hotpepper.jp/strJ001234567/", "https://www.hotpepper.jp/strJ001234567/food/"));
  assert(!sameMenuListing("https://www.hotpepper.jp/strJ001234567/", "https://www.hotpepper.jp/strJ009999999/food/"));
  assert(sameMenuListing("https://beauty.hotpepper.jp/kr/slnH000123456/", "https://beauty.hotpepper.jp/kr/slnH000123456/coupon/"));
  assert(sameMenuListing("https://restaurant.ikyu.com/123456/", "https://restaurant.ikyu.com/123456/plan/"));
  assert(!sameMenuListing("https://brand.example/shop/a", "https://brand.example/shop/b/menu"));
});

test("参照カードのドメイン別表示で省略された料理URLも、検証済み出典なら維持する", async () => {
  assert.equal(normalizeDiagnosisSources(root, [source(root), source(food)], false).length, 1);
  const result = await discoverStoreMenus(input(), { research: async () => researchResult(), fetchPage: refuseRead });
  assert.equal(result.menus[0].sourceUrl, food);
});

test("検索で実際に確認されていないURL・別店舗ID・違う地域・電話は全て拒否", async () => {
  for (const result of [
    researchResult({ sources: [] }),
    researchResult({ menu_pages: [researchPage(other)], menu_candidates: [menu(other)], sources: [source(other)] }),
    researchResult({ menu_pages: [researchPage(food, { address: "長野県長野市1-2-3" })] }),
    researchResult({ menu_pages: [researchPage(food, { phone: "03-9999-9999" })] }),
    researchResult({ menu_pages: [researchPage(food, { store_name: "別のお店" })] })
  ]) {
    const found = await discoverStoreMenus(input(), { research: async () => result, fetchPage: async () => assert.fail("Must not read rejected source") });
    assert.equal(found.menus.length, 0);
  }
});

test("最初の検索に別店舗の出典・商品が混入しても入力URLの店舗IDを優先する", async () => {
  const found = await discoverStoreMenus(input({ sources: [source(root), source(other)], menus: [menu(other)] }), {
    research: async () => researchResult({ menu_pages: [researchPage(other)], menu_candidates: [menu(other)], sources: [source(other)] }),
    fetchPage: async () => assert.fail("Foreign listing must never be read")
  });
  assert.equal(found.menus.length, 0);
});

test("未確認の新サイトにはページごとの店舗名・住所/電話の根拠が必要", async () => {
  const url = "https://cafe.example/menu";
  for (const identity_evidence of ["", "長野のカフェです"]) {
    const result = await discoverStoreMenus(input(), { research: async () => researchResult({ menu_pages: [researchPage(url, { identity_evidence })], menu_candidates: [menu(url)], sources: [source(url)] }), fetchPage: refuseRead });
    assert.equal(result.menus.length, 0);
  }
  const result = await discoverStoreMenus(input(), { research: async () => researchResult({ menu_pages: [researchPage(url)], menu_candidates: [menu(url)], sources: [source(url)] }), fetchPage: refuseRead });
  assert.equal(result.menus.length, 1);
});

test("除外したサイトはリンク取得しない・追加調査への混入も結果ごと拒否", async () => {
  const blocked = "https://bad.example/";
  assert.deepEqual(discoverLinkedMenuUrls([{ ...page(blocked), html: '<a href="/menu">メニュー</a>' }], [blocked], [blocked]), []);
  const found = await discoverStoreMenus(input({ excluded: [blocked] }), { research: async () => researchResult({ sources: [source(food), source("https://sub.bad.example/menu")] }), fetchPage: async () => assert.fail("Excluded investigation must be discarded") });
  assert.equal(found.menus.length, 0); assert.equal(found.summary.status, "unavailable");
});

test("取得後の別店舗リダイレクト・除外先リダイレクトを直接取得の根拠にしない", async () => {
  for (const redirected of [page(other), page("https://bad.example/menu")]) {
    const found = await discoverStoreMenus(input({ excluded: ["https://bad.example/"] }), { research: async () => researchResult({ menu_candidates: [] }), fetchPage: async () => redirected });
    assert.equal(found.menus.length, 0); assert.equal(found.summary.pagesRead, 0);
  }
});

test("価格の競合は一方に決めず価格未確認へ戻す・同価格なら本文出典を優先", () => {
  const a = menu(), b = { ...menu("https://cafe.example/menu", 1300), sourceAccess: "page" };
  assert.equal(mergePublicMenuCandidates([[a], [b]])[0].unitPrice, null);
  assert.match(mergePublicMenuCandidates([[a], [b]])[0].evidence, /違い/);
  assert.equal(mergePublicMenuCandidates([[a], [{ ...a, sourceAccess: "page" }]])[0].sourceAccess, "page");
  assert.equal(mergePublicMenuCandidates([[a], [{ ...a, taxInclusion: "exclusive" }]])[0].taxInclusion, "unknown");
});

test("本文取得済みの商品候補が既にあるときは再調査をせず・既存候補を消さない", async () => {
  const found = await discoverStoreMenus(input({ menus: [{ ...menu(), sourceAccess: "page" }] }), { research: async () => assert.fail("No repeated AI"), fetchPage: async () => assert.fail("No repeated fetch") });
  assert.equal(found.menus.length, 1); assert.equal(found.summary.searched, false);
});

test("検索に残った404/410の古い価格で調査を終了しない・同じ死んだ出典を再採用しない", async () => {
  for (const code of ["http_404", "http_410"]) {
    const found = await discoverStoreMenus(input({ menus: [menu()] }), {
      fetchPage: async () => { throw new PublicUrlError(code, "gone"); },
      research: async () => researchResult()
    });
    assert.equal(found.summary.searched, true); assert.equal(found.summary.pricedCount, 0);
    assert.equal(found.menus[0].unitPrice, null); assert.match(found.menus[0].evidence, /再確認/u);
  }
});

test("古い検索ページが404でも、既に確認された現行の料理URLへ進んで本文の価格を取得する", async () => {
  const stale = "https://closed.example/";
  let calls = 0;
  const found = await discoverStoreMenus(input({ sources: [source(root), source(food)], menus: [menu(stale, 900)] }), {
    fetchPage: async url => { calls++; if (url === stale) throw new PublicUrlError("http_404", "gone"); assert.equal(url, food); return page(); },
    research: async () => assert.fail("Known menu URL avoids extra AI")
  });
  assert.equal(calls, 2); assert.equal(found.summary.searched, false);
  assert.equal(found.menus[0].unitPrice, 1200); assert.equal(found.menus[0].sourceAccess, "page");
});

test("検索価格の出典が403なら閉鎖と誤判定しない・確認前の検索候補として保持する", async () => {
  const found = await discoverStoreMenus(input({ menus: [menu()] }), { fetchPage: refuseRead, research: async () => assert.fail("No extra AI for a valid search price") });
  assert.equal(found.menus[0].unitPrice, 1200); assert.equal(found.menus[0].sourceAccess, "search");
  assert.equal(found.summary.searched, false);
});

test("検索で確認済みの料理URLは、商品0件でも追加AIより先に本文を読む", async () => {
  const found = await discoverStoreMenus(input({ sources: [source(root), source(food)] }), {
    fetchPage: async url => { assert.equal(url, food); return page(); }, research: async () => assert.fail("No extra AI")
  });
  assert.equal(found.summary.pagesRead, 1); assert.equal(found.menus[0].unitPrice, 1200);
});

test("口コミの過去の支払額は商品価格にしない・店舗トップの実リンクから料理へ進む", async () => {
  const review = `${root}dtlrvwlst/B000001/`;
  const landing = "https://www.hotpepper.jp/strJ001234567/";
  const foodUrl = `${landing}food/`;
  const requested = [];
  const found = await discoverStoreMenus(input({ sources: [source(root), source(landing)], menus: [menu(review, 660)] }), {
    fetchPage: async url => { requested.push(url); return url === landing ? { ...page(url), html: `<h1>${store.store_name}</h1><a href="${foodUrl}">料理メニュー</a><footer>${store.address}</footer>` } : page(foodUrl); },
    research: async () => assert.fail("Follow observed menu link before AI")
  });
  assert.equal(publicMenuUrl(review), "");
  assert.deepEqual(requested, [landing, foodUrl]);
  assert.equal(found.menus[0].unitPrice, 1200); assert.equal(found.menus[0].sourceUrl, foodUrl);
});

test("別店舗へ移動するランディングは、その先のメニューリンクも辿らない", async () => {
  const landing = "https://www.hotpepper.jp/strJ001234567/";
  const found = await discoverStoreMenus(input({ sources: [source(root), source(landing)] }), {
    fetchPage: async () => ({ url: landing, title: "別の店", description: "", html: '<a href="food/">メニュー</a><p>長野県長野市</p>' }),
    research: async () => ({ menu_pages: [], menu_candidates: [], sources: [] })
  });
  assert.equal(found.summary.pagesRead, 0); assert.equal(found.menus.length, 0);
});

test("追加調査がタイムアウトしても既存の未価格候補と元の店舗情報を保持", async () => {
  const original = input({ menus: [menu(food, null)] });
  const found = await discoverStoreMenus(original, { research: async () => { throw Error("timeout"); }, fetchPage: refuseRead });
  assert.equal(found.menus[0].unitPrice, null); assert.equal(found.summary.status, "unavailable");
  assert.deepEqual(original.store, store); assert.equal(original.menus.length, 1);
});

test("追加調査は最大1回・追加取得は最大3ページで打ち切る", async () => {
  const urls = ["food", "drink", "lunch", "dinner", "menu", "price"].map(path => `${root}${path}/`);
  let searches = 0, reads = 0;
  await discoverStoreMenus(input(), { research: async () => { searches++; return researchResult({ menu_pages: urls.map(url => researchPage(url)), menu_candidates: [], sources: urls.map(source) }); }, fetchPage: async () => { reads++; return refuseRead(); } });
  assert.equal(searches, 1); assert.equal(reads, 3);
});

test("見出しと価格を結び付ける・説明文を商品名にしない・価格帯と総称は除外", () => {
  const menus = extractPublicMenus([page()]);
  assert.equal(menus.length, 1); assert.equal(menus[0].name, "有機野菜のランチセット");
  assert.equal(menus[0].unitPrice, 1200); assert.equal(menus[0].taxInclusion, "inclusive");
});

test("危険なメニューURLを表示も取得もしない", () => {
  for (const url of ["javascript:alert(1)", "http://127.0.0.1/menu", "http://[::1]/menu", "http://localhost/menu", "https://internal.local/menu", "https://u:p@cafe.example/menu", "https://cafe.example/menu?access_token=secret", "https://cafe.example:8443/menu"]) assert.equal(publicMenuUrl(url), "");
  assert.equal(publicMenuUrl(food, ["https://tabelog.com/"]), "");
});

test("公開プレビューにも商品名・税込価格・出典を表示するが確認済み/登録済みにしない", () => {
  const preview = publicAnalysisPreview({ profile: { ...store, menu_candidates: [menu()], services: ["ランチ", "個室利用"] }, diagnosis: { menu_discovery: { status: "found" } } });
  assert.equal(preview.diagnosis.menu_candidates.length, 1);
  assert.equal(preview.diagnosis.menu_candidates[0].unitPrice, 1200);
  assert.equal(preview.diagnosis.menu_candidates[0].sourceUrl, food);
  assert.equal(preview.diagnosis.menu_discovery_status, "found");
  assert.equal("confirmed" in preview.diagnosis.menu_candidates[0], false);
});

const lookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const htmlResponse = html => new Response(html, { headers: { "content-type": "text/html" } });
test("追加取得もSSRFとリダイレクトの全段階を検証・子リンクへ勝手に巡回しない", async () => {
  let requests = 0;
  const fetched = await fetchPublicStorePage("https://cafe.example/menu", { lookupFn, fetchFn: async () => { requests++; return htmlResponse('<a href="/other">別メニュー</a>'); } });
  assert.equal(requests, 1); assert.equal(fetched.url, "https://cafe.example/menu");
  await assert.rejects(fetchPublicStorePage("https://cafe.example/menu", { lookupFn, fetchFn: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }) }), /公開/u);
});

test("DNSや本文が止まっても1ページの総時間上限を守る", async () => {
  await assert.rejects(fetchPublicStorePage("https://cafe.example/menu", { timeoutMs: 15, lookupFn: async () => new Promise(() => {}), fetchFn: async () => htmlResponse("") }), error => error.code === "fetch_timeout");
  const body = new ReadableStream({ start() {} });
  await assert.rejects(fetchPublicStorePage("https://cafe.example/menu", { timeoutMs: 15, lookupFn, fetchFn: async () => new Response(body, { headers: { "content-type": "text/html" } }) }), error => error.code === "fetch_timeout");
});
