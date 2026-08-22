const baseUrl = process.env.URL_ONBOARDING_BASE_URL;
const sourceUrl = process.env.URL_ONBOARDING_SOURCE_URL ?? "https://example.com/";

if (!baseUrl) throw new Error("Set URL_ONBOARDING_BASE_URL for a staging test.");

const analysisResponse = await fetch(`${baseUrl}/api/public/store-analysis`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ source_url: sourceUrl })
});
const analysis = await analysisResponse.json();
if (!analysisResponse.ok || !analysis.ok || typeof analysis.analysis_token !== "string") {
  throw new Error(`Staging analysis failed with status ${analysisResponse.status}.`);
}
if ("target_questions" in (analysis.diagnosis ?? {}) || "address" in (analysis.profile ?? {})) {
  throw new Error("The unauthenticated preview exposed detailed diagnosis data.");
}

const unverifiedResponse = await fetch(`${baseUrl}/api/applications`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    analysis_token: analysis.analysis_token,
    contact_name: "未確認テスト",
    email: "unverified@example.com",
    phone: "090-0000-0000",
    company_name: "",
    store_relationship: "owner",
    authority_confirmed: true,
    message: ""
  })
});
const unverified = await unverifiedResponse.json();
if (unverifiedResponse.status !== 403 || unverified.ok) {
  throw new Error(`An unverified application was not rejected (status ${unverifiedResponse.status}).`);
}

console.log(JSON.stringify({
  analysis: "ok",
  preview_is_limited: true,
  unverified_application_rejected: true,
  analysis_status: analysis.status
}, null, 2));
