import assert from "node:assert/strict";
import { constrainCaption, detectImageType, normalizeHashtags, SNS_LIMITS } from "../lib/phase5/sns-rules.ts";

assert.equal(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
assert.equal(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
assert.equal(detectImageType(new TextEncoder().encode("RIFFxxxxWEBP")), "image/webp");
assert.equal(detectImageType(new TextEncoder().encode("<script>")), null);
assert.deepEqual(normalizeHashtags("#鎌倉 鎌倉 #あんみつ", "x"), ["鎌倉", "あんみつ"]);
for (const channel of ["instagram", "facebook", "x", "line"]) {
  const result = constrainCaption(channel, { body: "あ".repeat(7000), short_body: "短".repeat(1000), hashtags: Array.from({ length: 50 }, (_, index) => `tag${index}`), cta: "予約する" });
  assert.ok(result.full_text.length <= SNS_LIMITS[channel].body, `${channel} body limit`);
  assert.ok(result.hashtags.length <= SNS_LIMITS[channel].hashtags, `${channel} hashtag limit`);
  assert.equal(result.valid, true);
}
console.log("SNS media rules: OK");
