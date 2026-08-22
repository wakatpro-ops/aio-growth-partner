import assert from "node:assert/strict";
import test from "node:test";
import {
  initialSetupCandidateKey,
  mayConfirmInitialSetup,
  parseInitialSetupForm
} from "../lib/onboarding/initial-setup-rules.ts";

function baseForm() {
  const form = new FormData();
  form.set("final_confirmation", "on");
  form.set("store_name", "テストサロン");
  form.set("industry_type_key", "beauty_salon");
  form.set("address", "東京都杉並区");
  form.set("phone", "03-1234-5678");
  form.set("website_url", "https://example.com/salon");
  form.set("description", "完全予約制のサロンです。");
  form.set("invoice_issuer_name", "テストサロン");
  form.set("invoice_registration_number", "T1234567890123");
  form.set("invoice_prefix", "SALON");
  form.set("menu_enabled_0", "on");
  form.set("menu_name_0", "ハーブピーリング");
  form.set("menu_type_0", "service");
  form.set("menu_unit_price_0", "12000");
  form.set("menu_tax_rate_0", "10");
  form.set("menu_tax_inclusion_0", "inclusive");
  form.set("menu_name_1", "除外候補");
  form.set("menu_type_1", "service");
  form.set("menu_unit_price_1", "0");
  return form;
}

test("対象組織の店舗オーナーだけが初期設定を確定できる", () => {
  const organizationId = "org-1";
  assert.equal(mayConfirmInitialSetup(null, organizationId), false);
  assert.equal(mayConfirmInitialSetup({ accountActive: true, isPlatformAdmin: false, organizationRoles: {} }, organizationId), false);
  assert.equal(mayConfirmInitialSetup({ accountActive: true, isPlatformAdmin: false, organizationRoles: { [organizationId]: "staff" } }, organizationId), false);
  assert.equal(mayConfirmInitialSetup({ accountActive: true, isPlatformAdmin: false, organizationRoles: { [organizationId]: "store_manager" } }, organizationId), false);
  assert.equal(mayConfirmInitialSetup({ accountActive: true, isPlatformAdmin: true, organizationRoles: { [organizationId]: "org_owner" } }, organizationId), false);
  assert.equal(mayConfirmInitialSetup({ accountActive: true, isPlatformAdmin: false, organizationRoles: { [organizationId]: "org_owner" } }, organizationId), true);
});

test("承認したメニューだけを正式反映用データとして解析する", () => {
  const result = parseInitialSetupForm(baseForm(), "snapshot-1", 2);
  assert.equal(result.storeName, "テストサロン");
  assert.equal(result.menus.length, 2);
  assert.deepEqual(result.menus.map((menu) => menu.enabled), [true, false]);
  assert.equal(result.menus[0].unitPrice, 12000);
  assert.equal(result.menus[0].sourceKey, "initial-setup:snapshot-1:0");
});

test("同じsnapshotと候補番号から常に同じ重複防止キーを作る", () => {
  assert.equal(initialSetupCandidateKey("snapshot-1", 0), initialSetupCandidateKey("snapshot-1", 0));
  assert.notEqual(initialSetupCandidateKey("snapshot-1", 0), initialSetupCandidateKey("snapshot-1", 1));
  assert.throws(() => initialSetupCandidateKey("snapshot-1", 30));
});

test("最終確認なし、危険なURL、不正な登録番号を拒否する", () => {
  const noConsent = baseForm();
  noConsent.delete("final_confirmation");
  assert.throws(() => parseInitialSetupForm(noConsent, "snapshot-1", 2), /同意/u);

  const unsafeUrl = baseForm();
  unsafeUrl.set("website_url", "javascript:alert(1)");
  assert.throws(() => parseInitialSetupForm(unsafeUrl, "snapshot-1", 2), /店舗サイト/u);

  const invalidRegistration = baseForm();
  invalidRegistration.set("invoice_registration_number", "1234");
  assert.throws(() => parseInitialSetupForm(invalidRegistration, "snapshot-1", 2), /Tと13桁/u);
});

test("候補件数を上限30件に制限する", () => {
  const form = baseForm();
  for (let index = 0; index < 35; index += 1) {
    form.set(`menu_name_${index}`, `候補${index}`);
    form.set(`menu_unit_price_${index}`, "0");
  }
  assert.equal(parseInitialSetupForm(form, "snapshot-1", 35).menus.length, 30);
});
