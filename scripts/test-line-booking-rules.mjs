import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { decryptLineUserId, encryptLineUserId, lineEventId, lineLinkCodeHash, lineUserHash, normalizeLineLinkCode, verifyLineSignature } from "../lib/line/signature.ts";
import { formatLineDateTime, isAffirmative, isNegative, lineSlotCandidates, numericChoice, parseLineDateTime } from "../lib/line/rules.ts";

test("LINE署名を正しく検証し改ざんを拒否する", () => {
  const secret = "unit-test-channel-secret";
  const body = JSON.stringify({ events: [{ webhookEventId: "evt-1" }] });
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(verifyLineSignature(body, signature, secret), true);
  assert.equal(verifyLineSignature(`${body} `, signature, secret), false);
  assert.equal(verifyLineSignature(body, null, secret), false);
});

test("Webhook ID、利用者、店舗コードは安定した非可逆値になる", () => {
  const body = "{\"events\":[]}";
  assert.equal(lineEventId(body, 0, "explicit-event"), "explicit-event");
  assert.equal(lineEventId(body, 0), lineEventId(body, 0));
  assert.notEqual(lineUserHash("user-a", "secret"), lineUserHash("user-b", "secret"));
  assert.equal(normalizeLineLinkCode(" abcd-1234 "), "ABCD1234");
  assert.equal(lineLinkCodeHash("abcd1234", "secret"), lineLinkCodeHash("ABCD-1234", "secret"));
});

test("LINE利用者IDを暗号化して復号できる", () => {
  const encrypted = encryptLineUserId("U0123456789", "secret");
  assert.notEqual(encrypted, "U0123456789");
  assert.equal(decryptLineUserId(encrypted, "secret"), "U0123456789");
  assert.throws(() => decryptLineUserId(encrypted, "wrong-secret"));
});

test("日本時間の入力を解析して30分刻みの候補を作る", () => {
  const now = new Date("2026-09-06T00:00:00.000Z");
  const parsed = parseLineDateTime("9/10 14:30", now);
  assert.equal(parsed, "2026-09-10T05:30:00.000Z");
  assert.deepEqual(lineSlotCandidates(String(parsed), 3), ["2026-09-10T05:30:00.000Z", "2026-09-10T06:00:00.000Z", "2026-09-10T06:30:00.000Z"]);
  assert.match(formatLineDateTime(String(parsed)), /9\/10 14:30/u);
  assert.equal(parseLineDateTime("来週くらい", now), null);
});

test("番号回答と同意・中止を誤判定しない", () => {
  assert.equal(numericChoice("①", 3), 0);
  assert.equal(numericChoice("3. 夕方", 3), 2);
  assert.equal(numericChoice("4", 3), null);
  assert.equal(isAffirmative("同意"), true);
  assert.equal(isNegative("中止"), true);
  assert.equal(isAffirmative("たぶん"), false);
});
