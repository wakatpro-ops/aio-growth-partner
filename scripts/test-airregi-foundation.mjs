// Real TypeScript modules, synthetic values only; no provider/AI/email calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const cache = new Map();
let databaseReads = 0;
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/admin') return { createSupabaseAdminClient() { databaseReads++; throw new Error('must not read database'); } };
    if (name === '@/lib/auth/server' || name === '@/lib/stores') return {};
    if (name.startsWith('.')) return load(resolve(dirname(file), `${name}.ts`));
    return require(name);
  }, mod, mod.exports);
  cache.set(file, mod.exports); return mod.exports;
}
const contracts = load('lib/airregi/contracts.ts');
const normalize = load('lib/airregi/normalize.ts');
const secrets = load('lib/airregi/secrets.ts');
const adapter = load('lib/airregi/adapter.ts');
const service = load('lib/airregi/service.ts');
const aiRules = load('lib/store-ai/context-rules.ts');
const aiKnowledge = load('lib/store-ai/knowledge.ts');
const sale = contracts.transactionSchema.parse({ sourceId:'order-1',revisionAt:'2026-10-14T09:00:00Z',occurredAt:'2026-10-13T23:00:00+09:00',businessDate:'2026-10-13',kind:'sale',amountMinor:1100,taxMinor:100,items:[{sourceItemId:'line-1',name:'架空定食',quantity:1,unitPriceMinor:1100,amountMinor:1100,taxMinor:100}] });
const page = { externalStoreId:'synthetic:store-1',transactions:[sale],nextCursor:null,watermark:'2026-10-14T09:00:00Z' };
assert.equal(normalize.projectAirRegiTransaction(sale).gross_amount,1100);
assert.equal(normalize.projectAirRegiTransaction({...sale,kind:'refund'}).gross_amount,-1100);
assert.equal(normalize.projectAirRegiTransaction({...sale,kind:'void'}).gross_amount,0);
assert.equal(normalize.projectAirRegiTransaction(sale).business_date,'2026-10-13','business day is not guessed from UTC');
assert.equal(normalize.validateAirRegiPage(page,page.externalStoreId,null,null).transactions.length,1);
for (const bad of [
  {...sale,businessDate:'2026-04-31'}, {...sale,amountMinor:1100.5}, {...sale,taxMinor:1101},
  {...sale,amountMinor:1200}, {...sale,items:[sale.items[0],sale.items[0]]},
  {...sale,items:[{...sale.items[0],quantity:0.00001}]}, {...sale,unapprovedData:'private'},
]) assert.equal(contracts.transactionSchema.safeParse(bad).success,false);
for (const [bad,cursor,watermark] of [
  [{...page,externalStoreId:'other'},null,null],
  [{...page,nextCursor:'same',watermark:null},'same',null],
  [{...page,watermark:null},null,page.watermark],
  [{...page,nextCursor:'next'},null,null],
  [{...page,transactions:[sale,sale]},null,null],
]) assert.throws(()=>normalize.validateAirRegiPage(bad,page.externalStoreId,cursor,watermark));
assert.equal(normalize.transactionFingerprint(sale),normalize.transactionFingerprint(contracts.transactionSchema.parse({...sale})));
assert.equal(normalize.transactionFingerprint(sale),normalize.transactionFingerprint(contracts.transactionSchema.parse({...sale,revisionAt:'2026-10-14T18:00:00+09:00'})),'timestamp representation must not create false conflicts');
assert.equal(normalize.validateAirRegiPage({...page,nextCursor:'next'},page.externalStoreId,'previous','2026-10-14T09:00:00+00:00').nextCursor,'next','equivalent DB/provider timestamps');
process.env.AIRREGI_TOKEN_ENCRYPTION_KEY='synthetic-only-32-character-test-key-not-a-real-secret';
const credentials={apiKey:'synthetic-key',apiToken:'synthetic-token'};
const cipher=secrets.encryptAirRegiCredentials(credentials,'org-1','store-1');
assert(!cipher.includes(credentials.apiKey));
assert.deepEqual(secrets.decryptAirRegiCredentials(cipher,'org-1','store-1'),credentials);
assert.throws(()=>secrets.decryptAirRegiCredentials(cipher,'org-2','store-1'));
assert.throws(()=>secrets.decryptAirRegiCredentials(cipher,'org-1','store-2'));
assert.throws(()=>secrets.decryptAirRegiCredentials(cipher.slice(0,-8)+'tampered','org-1','store-1'));
assert.equal(adapter.getAirRegiAdapter(),null);
assert.throws(()=>adapter.requireAirRegiAdapter());
assert.deepEqual(await service.runAirRegiSync(),{status:'awaiting_connection_setup',synced:0});
assert.equal(databaseReads,0);
assert.equal(aiRules.salesFacts([{business_date:'2026-10-13',gross_amount:1100},{business_date:'2026-10-13',gross_amount:0,source_metadata:{air_regi_state:'void'}}]).count,1,'AI must not count cancelled receipts');
assert.match(aiKnowledge.pageKnowledge({area:'settings',pathname:'/stores/synthetic/settings/integrations/airregi'}).guidance,/実接続・自動取込を利用できない/);
let storedCode;
const db={rpc:async(name,args)=>{
  if(name==='claim_air_regi_sync') return {data:{id:'c',organization_id:'org-1',store_id:'store-1',external_store_id:page.externalStoreId,encrypted_credentials:cipher,lease_id:'lease',cursor:null,watermark:null,interval_seconds:60},error:null};
  if(name==='fail_air_regi_sync'){storedCode=args.p_code;return {error:null};}
  throw new Error('Invalid data must not be applied');
}};
assert.equal((await service.syncAirRegiConnection(db,{specificationVersion:'synthetic-v1',minimumIntervalSeconds:60,readPage:async()=>({...page,externalStoreId:'wrong'})},'c')).status,'error');
assert.equal(storedCode,'store_mismatch');
await service.syncAirRegiConnection(db,{specificationVersion:'synthetic-v1',minimumIntervalSeconds:60,readPage:async()=>{throw new Error('contains synthetic-token');}},'c');
assert.equal(storedCode,'sync_failed');
console.log('PASS Airレジ canonical validation, sale/refund/void, business date, cursor, reconciliation, tenant-bound encryption, disabled production adapter, sanitized errors');
