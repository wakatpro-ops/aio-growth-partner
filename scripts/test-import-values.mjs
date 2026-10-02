import assert from "node:assert/strict";
import { normalizeImportBusinessDate, parseImportDateIso } from "../lib/import-date.ts";
import { parseImportNumber, parseImportQuantity, validateUnifiedImportValues } from "../lib/unified-import/value-validation.ts";

const originalTimezone = process.env.TZ;
try {
  for (const timezone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
    process.env.TZ = timezone;
    for (const date of ["2026-09-01", "2026/9/1", "2026.9.1", "20260901", "２０２６年９月１日", "２０２６／９／１"]) {
      assert.equal(normalizeImportBusinessDate(date), "2026-09-01", date);
      assert.equal(parseImportDateIso(date), "2026-09-01T00:00:00.000Z", `${timezone}: ${date}`);
    }
    assert.equal(parseImportDateIso("2026/9/1", "000000"), "2026-08-31T15:00:00.000Z");
    assert.equal(parseImportDateIso("2026/9/1", "９：３０"), "2026-09-01T00:30:00.000Z");
    assert.equal(parseImportDateIso("20260901", "1230"), "2026-09-01T03:30:00.000Z");
    assert.equal(parseImportDateIso("2026-09-01 12:30:00"), "2026-09-01T03:30:00.000Z");
    assert.equal(parseImportDateIso("2026-09-01T00:00:00.125Z"), "2026-09-01T00:00:00.125Z");
    assert.equal(parseImportDateIso("2026-09-01T00:00:00+09:00"), "2026-08-31T15:00:00.000Z");
    assert.equal(parseImportDateIso("2026-09-01T00:00:00-0700"), "2026-09-01T07:00:00.000Z");
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}

for (const date of ["9月1日", "9/1/26", "26/9/1", "2026-09-31", "2026-02-29", "1900-02-29", "2026-13-01", "2026-00-01", "2026-01-00", "46266", "0000-01-01", "#VALUE!", "2026/9-1", "2026-09-01 trailing"]) {
  assert.equal(parseImportDateIso(date), null, date);
  assert.equal(normalizeImportBusinessDate(date), null, date);
}
assert.equal(normalizeImportBusinessDate("2000-02-29"), "2000-02-29");
assert.equal(normalizeImportBusinessDate("2024-02-29"), "2024-02-29");
for (const time of ["24:00", "09:60", "09:30:60", "090099", "09:30+25:00", "09:30+09:99", "09:30+14:30", "noon"]) {
  assert.equal(parseImportDateIso("2026-09-01", time), null, time);
}
assert.equal(parseImportDateIso("2026-09-01T10:00", "12:00"), null);

for (const [input, expected] of [
  [0, 0], [1000, 1000], ["0", 0], ["1,000", 1000], ["￥１，２３４円", 1234], ["¥ 1,234.50", 1234.5],
  ["(1,000)", -1000], ["（￥１，０００）", -1000], ["￥（１，０００）円", -1000], ["△1,000円", -1000], ["▲￥1,000", -1000],
  ["¥-1,000", -1000], ["-¥1,000", -1000], ["−1000", -1000], ["JPY 1,000", 1000], ["1,000 JPY", 1000], [".5", 0.5]
]) assert.equal(parseImportNumber(input), expected, String(input));
for (const input of ["#VALUE!", "#DIV/0!", "text", "=SUM(A1:A2)", "1 000", "1,00", "1,2,3", "12円34", "--1", "(-1000)", "△-1000", "NaN", "Infinity", "0x10", "1e3", true, {}, [1], NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(parseImportNumber(input, { blankValue: 0 }), null, String(input));
}
assert.equal(parseImportNumber(""), null);
assert.equal(parseImportNumber("", { blankValue: 0 }), 0);
assert.equal(parseImportNumber(undefined, { blankValue: 10 }), 10);
for (const input of [undefined, null, "", "　 "]) assert.equal(parseImportQuantity(input), 1);
assert.equal(parseImportQuantity("0"), 0);
assert.equal(parseImportQuantity("bad"), null);
assert.deepEqual(validateUnifiedImportValues("sale", { date: "2026/9/1", amount: "(1,000)", quantity: "" }), []);
assert.deepEqual(validateUnifiedImportValues("sale", { date: "2026-02-30", amount: "#VALUE!", quantity: "bad" }).map((issue) => issue.field), ["date", "amount", "quantity"]);
assert.deepEqual(validateUnifiedImportValues("sale", { date: "2026-09-01", time: "24:00", amount: 0 }).map((issue) => issue.field), ["time"]);
assert.deepEqual(validateUnifiedImportValues("expense", { date: "2026-09-01", amount: "1000円", tax_amount: "不明" }).map((issue) => issue.field), ["tax_amount"]);
assert.deepEqual(validateUnifiedImportValues("customer", { birth_date: "9/1/26", visit_count: "1.5" }).map((issue) => issue.field), ["birth_date", "visit_count"]);
assert.deepEqual(validateUnifiedImportValues("ignore", { date: "bad", amount: "#VALUE!" }), []);

console.log("Strict import calendar dates, monetary values, quantity defaults, and semantic validation tests passed.");
