import assert from "node:assert/strict";
import test from "node:test";
import { bookingDurationMinutes, intervalsOverlap, parseJapanDateTimeLocal, toJapanDateTimeLocal } from "../lib/bookings/rules.ts";

test("重なる時間帯を検出する", () => {
  assert.equal(intervalsOverlap(
    { startsAt: "2026-09-06T01:00:00Z", endsAt: "2026-09-06T02:00:00Z", status: "confirmed" },
    { startsAt: "2026-09-06T01:30:00Z", endsAt: "2026-09-06T02:30:00Z", status: "pending" }
  ), true);
});
test("終了時刻と次の開始時刻が同じ連続予約は許可する", () => {
  assert.equal(intervalsOverlap(
    { startsAt: "2026-09-06T01:00:00Z", endsAt: "2026-09-06T02:00:00Z", status: "confirmed" },
    { startsAt: "2026-09-06T02:00:00Z", endsAt: "2026-09-06T03:00:00Z", status: "confirmed" }
  ), false);
});

test("キャンセル・完了・削除済みは空き枠を塞がない", () => {
  const candidate = { startsAt: "2026-09-06T01:30:00Z", endsAt: "2026-09-06T02:30:00Z", status: "confirmed" };
  for (const status of ["cancelled", "completed", "no_show"]) {
    assert.equal(intervalsOverlap({ startsAt: "2026-09-06T01:00:00Z", endsAt: "2026-09-06T02:00:00Z", status }, candidate), false);
  }
  assert.equal(intervalsOverlap({ startsAt: "2026-09-06T01:00:00Z", endsAt: "2026-09-06T02:00:00Z", archived: true }, candidate), false);
});

test("日本時間の日時入力をUTCへ変換し往復できる", () => {
  const iso = parseJapanDateTimeLocal("2026-09-06T10:30");
  assert.equal(iso, "2026-09-06T01:30:00.000Z");
  assert.equal(toJapanDateTimeLocal(iso), "2026-09-06T10:30");
  assert.equal(bookingDurationMinutes(iso, "2026-09-06T02:45:00.000Z"), 75);
});

test("不正な日時入力を拒否する", () => {
  assert.throws(() => parseJapanDateTimeLocal("2026/09/06 10:30"), /予約日時/u);
});
