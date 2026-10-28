// Only synthetic internal-protocol fixtures. No confidential provider schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),cache=new Map();
let access={userId:'owner'}, owner=true, saved=[], requests=[];
const db={rpc:async(name,args)=>{
  if(name==='air_regi_owner_allowed') return {data:owner,error:null};
  if(name==='save_air_regi_connection') {saved.push(args);return {data:'connection',error:null};}
  throw new Error('unexpected rpc');
}};
function load(file) {
  file=resolve(file); if(cache.has(file))return cache.get(file);
  const mod={exports:{}};cache.set(file,mod.exports);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>{
    if(name==='server-only')return {};
    if(name==='@/lib/supabase/admin')return {createSupabaseAdminClient:()=>db};
    if(name==='@/lib/auth/server')return {getCurrentUserAccess:async()=>access,canManageOrganization:async()=>owner};
    if(name==='@/lib/stores')return {getStore:async()=>({organization_id:'org'})};
    if(name==='next/cache')return {revalidatePath:()=>{}};
    if(name==='next/navigation')return {redirect:()=>{throw new Error('unexpected redirect');}};
    if(name.startsWith('@/'))return load(resolve(name.slice(2)+'.ts'));
    return name.startsWith('.')?load(resolve(dirname(file),name+'.ts')):require(name);
  },mod,mod.exports);cache.set(file,mod.exports);return mod.exports;
}
const bridge=load('lib/airregi/bridge.ts'),adapter=load('lib/airregi/adapter.ts'),service=load('lib/airregi/service.ts');
const actions=load('app/stores/[storeId]/settings/integrations/airregi/actions.ts');
const keys=['AIRREGI_ENABLED','AIRREGI_EGRESS_APPROVED','AIRREGI_BRIDGE_URL','AIRREGI_BRIDGE_AUTH_SECRET','AIRREGI_TOKEN_ENCRYPTION_KEY','AIRREGI_TEST_STORE_IDS'];
const before=Object.fromEntries(keys.map(k=>[k,process.env[k]])), originalFetch=globalThis.fetch;
const config={AIRREGI_ENABLED:'true',AIRREGI_EGRESS_APPROVED:'true',AIRREGI_BRIDGE_URL:'https://pos-worker.example.test/v1/air-regi',AIRREGI_BRIDGE_AUTH_SECRET:'synthetic-bridge-secret-'.repeat(3),AIRREGI_TOKEN_ENCRYPTION_KEY:'synthetic-encryption-key-'.repeat(3),AIRREGI_TEST_STORE_IDS:'11111111-1111-4111-8111-111111111111'};
const credentials={apiKey:'synthetic-key',apiToken:'synthetic-token'},storeId='11111111-1111-4111-8111-111111111111';
const response=data=>new Response(JSON.stringify({protocolVersion:'aiob-pos-v1',data}),{headers:{'content-type':'application/json'}});
try {
  for(const k of keys)delete process.env[k];assert.equal(adapter.getAirRegiAdapter(),null);
  Object.assign(process.env,config);
  for(const k of keys.filter(k=>k!=='AIRREGI_TEST_STORE_IDS')) {delete process.env[k];assert.equal(adapter.getAirRegiAdapter(),null,`missing ${k} must stay disabled`);process.env[k]=config[k];}
  process.env.AIRREGI_TEST_STORE_IDS='invalid';assert.deepEqual(bridge.airRegiTestStoreIds(),[]);Object.assign(process.env,config);
  for(const url of ['http://worker.test/v1/air-regi','https://127.0.0.1/v1/air-regi','https://localhost/v1/air-regi','https://worker.internal/v1/air-regi','https://pos-worker.example.test/other','https://u:p@pos-worker.example.test/v1/air-regi','https://pos-worker.example.test/v1/air-regi?token=no']) {
    process.env.AIRREGI_BRIDGE_URL=url;assert.equal(adapter.getAirRegiAdapter(),null);
  }
  Object.assign(process.env,config);
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return response({externalStoreId:'synthetic-external',name:'synthetic-external'});};
  const a=adapter.requireAirRegiAdapter();
  await a.probe(credentials,AbortSignal.timeout(1000));
  assert.equal(requests[0].url,config.AIRREGI_BRIDGE_URL);assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.cache,'no-store');
  assert.equal(requests[0].options.headers.authorization,`Bearer ${config.AIRREGI_BRIDGE_AUTH_SECRET}`);
  assert.equal(JSON.parse(requests[0].options.body).protocolVersion,'aiob-pos-v1');
  assert(!requests[0].url.includes(credentials.apiToken));
  for(const factory of [()=>new Response('private html',{headers:{'content-type':'text/html'}}),()=>new Response('private-error',{status:502,headers:{'content-type':'application/json'}}),()=>response('bad identity'),()=>new Response(JSON.stringify({protocolVersion:'wrong',data:{}}),{headers:{'content-type':'application/json'}}),()=>new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}})]) {
    globalThis.fetch=async()=>factory();
    await assert.rejects(()=>a.probe(credentials,AbortSignal.timeout(1000)));
  }
  globalThis.fetch=async()=>new Response(JSON.stringify({protocolVersion:'aiob-pos-v1',error:'authentication_required'}),{status:502,headers:{'content-type':'application/json'}});
  await assert.rejects(()=>a.probe(credentials,AbortSignal.timeout(1000)),error=>error instanceof bridge.AirRegiBridgeError&&error.code==='authentication_required');
  globalThis.fetch=async()=>{throw new Error('private upstream '+credentials.apiToken);};
  await assert.rejects(()=>a.probe(credentials,AbortSignal.timeout(1000)),error=>error.message==='sync_failed'&&!JSON.stringify(error).includes(credentials.apiToken));

  // Authorize BEFORE any credential transfer; commit must verify again.
  requests=[];globalThis.fetch=async(url,options)=>{requests.push({url,options});return response({externalStoreId:'synthetic-external',name:'synthetic-external'});};
  await assert.rejects(()=>service.probeAirRegi('22222222-2222-4222-8222-222222222222',credentials));assert.equal(requests.length,0,'unlisted stores cannot transfer credentials');
  access=null;await assert.rejects(()=>service.probeAirRegi(storeId,credentials));assert.equal(requests.length,0);
  access={userId:'owner'};owner=false;await assert.rejects(()=>service.probeAirRegi(storeId,credentials));assert.equal(requests.length,0);
  owner=true;assert.equal((await service.probeAirRegi(storeId,credentials)).externalStoreId,'synthetic-external');
  await assert.rejects(()=>service.connectAirRegi(storeId,credentials,'wrong-store'));assert.equal(saved.length,0);
  await service.connectAirRegi(storeId,credentials,'synthetic-external');assert.equal(saved.length,1);assert.equal(requests.length,3,'probe, rejected commit and accepted commit must each verify');
  assert(!JSON.stringify(saved[0]).includes(credentials.apiToken));assert.equal(saved[0].p_external,'synthetic-external');
  const form=new FormData();for(const [k,v] of Object.entries(credentials))form.set(k,v);form.set('intent','connect');form.set('confirmedExternalStoreId','synthetic-external');
  const rejected=await actions.connectAirRegiAction(storeId,form);assert(rejected.error);assert.equal(saved.length,1,'UI consent cannot be bypassed by direct server action');
  form.set('consent','yes');assert((await actions.connectAirRegiAction(storeId,form)).error);assert.equal(saved.length,1);
  form.set('noOverlap','yes');assert.deepEqual(await actions.connectAirRegiAction(storeId,form),{connected:true});assert.equal(saved.length,2);
  console.log('PASS disabled readiness gates, HTTPS/no redirects, bounded/sanitized responses, owner-before-transfer, explicit consent, re-probe and encrypted save');
} finally {
  globalThis.fetch=originalFetch;
  for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
