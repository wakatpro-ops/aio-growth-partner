import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calendarDays, customerWorkLabels, dataState, japanDay, overlapsDay, recencyGroup, shiftDay, validDay, visitGroup } from '../../lib/customer-workbench-rules.ts';
test('JST boundaries and Monday-start weeks, leap dates',()=>{
 assert.equal(japanDay('2026-09-25T15:00:00Z'),'2026-09-26');
 assert.deepEqual(calendarDays('2026-09-27',true),['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27']);
 assert.equal(calendarDays('2026-09-28',true)[0],'2026-09-28');
 assert.deepEqual(calendarDays('2026-09-25',false),['2026-09-25']);
 assert.equal(shiftDay('2024-02-28',1),'2024-02-29');
 for(const value of ['2026-02-29','2026-13-01','junk'])assert.equal(validDay(value,'fallback'),'fallback');
});
test('spanning bookings are visible, midnight end is exclusive',()=>{
 assert(overlapsDay('2026-09-24T23:00:00+09:00','2026-09-25T01:00:00+09:00','2026-09-25'));
 assert(!overlapsDay('2026-09-24T23:00:00+09:00','2026-09-25T00:00:00+09:00','2026-09-25'));
});
test('only confirmed never-registered data is eligible for preview',()=>{
 assert.equal(dataState(null,0,0),'error');assert.equal(dataState(0,0,0),'unregistered');
 assert.equal(dataState(2,0,0),'archived');assert.equal(dataState(2,2,0),'filtered-empty');assert.equal(dataState(2,2,2),'ready');
});
test('unknown histories remain unknown and future dates are not recency',()=>{
 for(const n of [undefined,null,0,-1])assert.equal(visitGroup(n),'unknown');
 assert.equal(visitGroup(1),'first');assert.equal(visitGroup(2),'repeat');
 assert.equal(recencyGroup('2026-06-27','2026-09-25'),'long');
 assert.equal(recencyGroup('2026-09-26','2026-09-25'),'unknown');
 assert.equal(recencyGroup('2026-08-27','2026-09-25'),'recent');
 assert.equal(recencyGroup('2026-08-26','2026-09-25'),'middle');
 assert.equal(customerWorkLabels('auto_repair').visit,'入庫');assert.equal(customerWorkLabels('restaurant').visit,'来店');
});
test('sample content is isolated from business APIs; loader authorizes before admin read',()=>{
 const preview=readFileSync('components/ui/data-preview.tsx','utf8');
 assert.match(preview,/表示イメージ・サンプルデータ/);assert.match(preview,/aria-hidden="true"/);
 assert.doesNotMatch(preview,/supabase|fetch\(|localStorage|sessionStorage/);
 const loader=readFileSync('lib/customer-workbench.ts','utf8');assert(loader.indexOf('await getStore(storeId)')<loader.indexOf('const db = createSupabaseAdminClient()'));
 assert.match(loader,/totals\.error/);assert.match(loader,/range\(from, from \+ 499\)/);
 const bookings=readFileSync('lib/bookings.ts','utf8').split('export async function listBookings')[1].split('export async function getBooking')[0];assert.doesNotMatch(bookings,/error\?\.code === "42P01"\) return \[\]/);
});
