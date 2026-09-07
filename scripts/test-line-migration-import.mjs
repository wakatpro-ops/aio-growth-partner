import assert from "node:assert/strict";
import test from "node:test";
import { analyzeLineMigrationRows } from "../lib/line/migration-import.ts";

test("日本語の予約CSVを列単位で解析し、将来の予約だけを候補にする", () => {
  const result = analyzeLineMigrationRows([
    { "予約日": "2030/10/01", "開始時間": "10:30", "顧客名": "予約 太郎", "メニュー名": "カット", "所要時間": "60分", "担当者": "木村" },
    { "予約日": "2020/01/01", "開始時間": "09:00", "顧客名": "過去 花子", "メニュー名": "カラー", "所要時間": "90" }
  ], new Date("2029-01-01T00:00:00Z"));
  assert.equal(result.validRows, 1);
  assert.equal(result.rows[0].status, "preview");
  assert.equal(result.rows[0].data.customerName, "予約 太郎");
  assert.equal(result.rows[0].data.staffName, "木村");
  assert.equal(new Date(result.rows[0].data.endsAt).getTime() - new Date(result.rows[0].data.startsAt).getTime(), 60 * 60_000);
  assert.equal(result.rows[1].status, "invalid");
  assert.match(result.rows[1].error ?? "", /過去/u);
});

test("予約日時が一列でも解析でき、不明なメールは確定候補にしない", () => {
  const result = analyzeLineMigrationRows([
    { "予約日時": "2030-12-20 15:00", "お客様名": "予約 次郎", "サービス名": "整体", "メール": "invalid" }
  ], new Date("2029-01-01T00:00:00Z"));
  assert.equal(result.validRows, 0);
  assert.match(result.rows[0].error ?? "", /メールアドレス/u);
});

test("日時列または顧客列がなければファイル全体の確認を求める", () => {
  assert.throws(() => analyzeLineMigrationRows([{ "顧客名": "予約 太郎" }]), /予約日と開始時間/u);
  assert.throws(() => analyzeLineMigrationRows([{ "予約日": "2030-01-01", "開始時間": "10:00" }]), /お客様名/u);
});
