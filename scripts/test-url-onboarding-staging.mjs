const baseUrl = process.env.URL_ONBOARDING_BASE_URL;
const sourceUrl = process.env.URL_ONBOARDING_SOURCE_URL ?? "https://aioboost.jp/";

if (!baseUrl || process.env.ALLOW_STAGING_APPLICATION_TEST !== "1") {
  throw new Error("Set URL_ONBOARDING_BASE_URL and ALLOW_STAGING_APPLICATION_TEST=1 for an explicit staging test.");
}

const analysisResponse = await fetch(`${baseUrl}/api/public/store-analysis`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ source_url: sourceUrl })
});
const analysis = await analysisResponse.json();
if (!analysisResponse.ok || !analysis.ok || typeof analysis.analysis_token !== "string") {
  throw new Error(`Staging analysis failed with status ${analysisResponse.status}.`);
}

const suffix = new Date().toISOString().replace(/\D/gu, "").slice(0, 14);
const applicationPayload = {
  analysis_token: analysis.analysis_token,
  store_name: `[STAGING TEST] ${analysis.profile?.store_name ?? "AIO boost URL onboarding"}`,
  industry_detail_key: analysis.profile?.industry_key ?? "other_service",
  address: analysis.profile?.address ?? "",
  representative_service: analysis.profile?.services?.[0] ?? "",
  contact_name: "ステージング自動テスト",
  email: `aio-url-onboarding-${suffix}@example.com`,
  phone: "",
  answers: {}
};

async function submitApplication() {
  const response = await fetch(`${baseUrl}/api/applications`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(applicationPayload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Staging application conversion failed with status ${response.status}.`);
  return result;
}

const first = await submitApplication();
const second = await submitApplication();
if (first.already_submitted !== false || second.already_submitted !== true) {
  throw new Error("Staging application conversion was not idempotent.");
}

console.log(JSON.stringify({
  analysis: "ok",
  analysis_status: analysis.status,
  ai_status: analysis.ai_status,
  conversion: "ok",
  duplicate_prevented: true,
  test_record_prefix: "[STAGING TEST]"
}, null, 2));
