import assert from "node:assert/strict";
import test from "node:test";
import { extractStoreProfile } from "../lib/applications/page-extraction.ts";
import {
  buildOperatingModelDraft,
  defaultOperatingModel,
  normalizeOperatingModel,
  operatingModelFeatureFlags
} from "../lib/applications/operating-model.ts";
import { initialSetupStoreCandidateKey, parseInitialSetupForm } from "../lib/onboarding/initial-setup-rules.ts";

function sampleProfile() {
  return extractStoreProfile([{ url: "https://example.com", title: "Salon A", description: "", html: `
    <script type="application/ld+json">[{"@type":"BeautySalon","name":"Salon A","address":{"addressRegion":"東京都","addressLocality":"杉並区","streetAddress":"梅里1-1"},"url":"https://example.com/a"},{"@type":"BeautySalon","name":"Salon B","address":{"addressRegion":"東京都","addressLocality":"中野区","streetAddress":"中央1-1"},"url":"https://example.com/b"}]</script>
    <p>ホットペッパービューティーから予約。Airレジとfreeeを利用。スタッフ指名・個室あり。</p>` }]);
}

function setupForm() {
  const form = new FormData();
  form.set("final_confirmation", "on");
  form.set("store_name", "Salon A");
  form.set("industry_type_key", "beauty_salon");
  form.set("invoice_issuer_name", "株式会社テスト");
  form.set("invoice_prefix", "INV");
  form.set("structure_mode", "multi_store");
  form.set("register_mode", "external_pos");
  form.set("service_mode", "reservation_only");
  form.set("resource_staff", "on");
  form.set("location_enabled_0", "on");
  form.set("location_name_0", "Salon B");
  form.set("location_address_0", "東京都中野区中央1-1");
  form.set("location_website_0", "https://example.com/b");
  return form;
}

test("公開情報から複数店舗・既存システム・予約資源の下書きを作る", () => {
  const profile = sampleProfile();
  const model = buildOperatingModelDraft(profile, "ai");
  assert.equal(model.structure.mode, "multi_store");
  assert.equal(model.structure.locations.length, 2);
  assert.deepEqual(model.systems.sales.serviceNames, ["Airレジ"]);
  assert.deepEqual(model.systems.reservations.serviceNames, ["ホットペッパービューティー"]);
  assert.deepEqual(model.systems.accounting.serviceNames, ["freee"]);
  assert.equal(model.register.mode, "external_pos");
  assert.ok(model.operations.reservationResources.includes("staff"));
  assert.ok(model.operations.reservationResources.includes("room"));
});

test("未設定の既存MVPは単一店舗の安全な既定値になる", () => {
  const model = normalizeOperatingModel({});
  assert.deepEqual(model, defaultOperatingModel());
  assert.equal(operatingModelFeatureFlags(model).simple_register, false);
});

test("入力件数と列挙値を制限し、簡易会計は既存機能を追加するだけにする", () => {
  const model = normalizeOperatingModel({
    structure: { mode: "invalid", companyNames: Array.from({ length: 20 }, (_, i) => `会社${i}`) },
    register: { mode: "simple_register" },
    operations: { reservationResources: ["staff", "invalid"] }
  });
  assert.equal(model.structure.mode, "single_store");
  assert.equal(model.structure.companyNames.length, 5);
  assert.deepEqual(model.operations.reservationResources, ["staff"]);
  const flags = operatingModelFeatureFlags(model);
  assert.equal(flags.simple_register, true);
  assert.equal(flags.order_management, true);
  assert.equal(flags.invoice_management, true);
});

test("初回確定で選択した追加店舗だけを重複防止キー付きで解析する", () => {
  const fallback = buildOperatingModelDraft(sampleProfile());
  const input = parseInitialSetupForm(setupForm(), "snapshot-5", 0, fallback);
  assert.equal(input.additionalLocations.length, 1);
  assert.equal(input.additionalLocations[0].name, "Salon B");
  assert.equal(input.additionalLocations[0].sourceKey, "initial-store:snapshot-5:0");
  assert.equal(initialSetupStoreCandidateKey("snapshot-5", 0), input.additionalLocations[0].sourceKey);
});
