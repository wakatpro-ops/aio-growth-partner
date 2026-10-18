import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STORE_IDENTITY_BUDGET_MS, STORE_IDENTITY_REQUEST_MAX_MS, storeIdentityTimeoutMs } from '../../lib/applications/store-analysis-budget.ts';

test('店舗特定の検索は35秒で早期打ち切りせず、1回最大60秒を確保する', () => {
  assert.equal(storeIdentityTimeoutMs(1_000, 1_000), 60_000);
  assert.equal(storeIdentityTimeoutMs(1_000, 36_000), 55_000);
  assert.equal(storeIdentityTimeoutMs(1_000, 0), STORE_IDENTITY_REQUEST_MAX_MS);
});
test('再試行に毎回60秒を与えず、店舗特定全体の90秒予算を共有する', () => {
  assert.equal(storeIdentityTimeoutMs(1_000, 61_000), 30_000);
  assert.equal(storeIdentityTimeoutMs(1_000, 90_000), 1_000);
  assert.equal(storeIdentityTimeoutMs(1_000, 90_001), 0);
  assert.equal(storeIdentityTimeoutMs(1_000, 91_000), 0);
  assert(14_000 + STORE_IDENTITY_BUDGET_MS + 55_000 < 180_000);
});
test('実リクエストにも残り時間を渡し、呼び出し上限と自動リトライ無効を維持する', () => {
  const code=readFileSync(new URL('../../lib/applications/store-analysis.ts', import.meta.url),'utf8');
  assert.match(code,/storeIdentityTimeoutMs\(identityStartedAt\)/u);
  assert.match(code,/if \(!timeoutMs\) break models;/u);
  assert.match(code,/requestAiAnalysis\([^;]+excluded, timeoutMs\)/u);
  assert.match(code,/\}, \{ timeout: timeoutMs, maxRetries: 0 \}\)/u);
  assert.match(code,/if \(calls >= 2\) break models;/u);
});
