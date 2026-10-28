// Explicit synthetic acceptance against the EXISTING staging only. No provider,
// AI, email, real-store access, or credential persistence outside process memory.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
assert(process.argv.includes('--staging-synthetic-live'));
const ref='zlqqjifitnvorudxbepy';
const workdir=process.env.AIRREGI_STAGING_CLI_DIR;
assert(workdir && readFileSync(`${workdir}/supabase/.temp/project-ref`,'utf8').trim()===ref,'Designated staging CLI only');
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='aio_staging_vercel'&&k.type==='secret')?.api_key;
const anon=keys.find(k=>k.type==='publishable')?.api_key;
assert(secret&&anon);
const url=`https://${ref}.supabase.co`;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const login=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=randomUUID(),store=randomUUID(),otherOrg=randomUUID(),otherStore=randomUUID();
const users=[],tokens={}; let connection,server,browser;
const base='http://localhost:3202',evidence='/private/tmp/aiob-airregi-ui';
const external=`synthetic:${randomUUID()}`;
const sale=(sourceId='sale-1',revisionAt='2026-10-14T09:00:00Z',kind='sale',amountMinor=1100)=>({sourceId,revisionAt,businessDate:'2026-10-13',occurredAt:'2026-10-13T23:00:00+09:00',kind,amountMinor,taxMinor:100,discountMinor:0,paymentMethod:'現金',adjustmentMinor:0,items:[{sourceItemId:'line-1',name:'架空定食',category:null,quantity:1,unitPriceMinor:amountMinor,amountMinor,taxMinor:100,discountMinor:0}]});
const forceDue=async()=>check(await db.from('air_regi_connections').update({next_sync_at:'2000-01-01T00:00:00Z',lease_id:null,lease_until:null}).eq('id',connection));
const claim=async()=>check(await db.rpc('claim_air_regi_sync',{p_id:connection,p_spec:'SYNTHETIC-v1'}));
const apply=async(lease,transactions,overrides={})=>db.rpc('apply_air_regi_page',{p_id:connection,p_lease:lease.lease_id,p_external:external,p_transactions:transactions,p_cursor:null,p_watermark:'2026-10-14T09:30:00Z',...overrides});
const current=async()=>check(await db.from('air_regi_connections').select('status,revision,cursor,watermark,last_success_at,encrypted_credentials,next_sync_at,last_error_code,failure_count').eq('id',connection).single());
const totals=async()=>check(await db.from('normalized_sales_summaries').select('gross_amount,transaction_count').eq('store_id',store).eq('summary_type','monthly'));
const versions=async()=>check(await db.from('air_regi_transaction_versions').select('id').eq('connection_id',connection));
const transition=async(action,actor=users[0])=>db.rpc('transition_air_regi_connection',{p_actor:actor,p_store:store,p_id:connection,p_action:action,p_revision:(await current()).revision});
const save=async(actor=users[0],storeId=store,externalId=external)=>db.rpc('save_air_regi_connection',{p_actor:actor,p_store:storeId,p_external:externalId,p_name:'架空レジ',p_ciphertext:'v1.synthetic-only',p_spec:'SYNTHETIC-v1',p_interval:60});
try {
  for(const role of ['owner','manager','staff','none','admin']) {
    const email=`airregi-${randomUUID()}@example.invalid`,password=`${randomUUID()}!aA9`;
    const user=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user;
    users.push(user.id);
    check(await db.from('user_profiles').upsert({user_id:user.id,display_name:`SYNTHETIC ${role}`,role:role==='admin'?'platform_admin':'user',status:'active'}));
    tokens[role]=check(await login.auth.signInWithPassword({email,password})).session.access_token;
  }
  check(await db.from('organizations').insert([{id:org,name:'AIRREGI SYNTHETIC',status:'active'},{id:otherOrg,name:'AIRREGI SYNTHETIC FOREIGN',status:'active'}]));
  check(await db.from('stores').insert([{id:store,organization_id:org,name:'Airレジ動作確認専用',industry_type_key:'restaurant',status:'active'},{id:otherStore,organization_id:otherOrg,name:'Airレジ他法人確認専用',industry_type_key:'restaurant',status:'active'}]));
  check(await db.from('organization_members').insert({organization_id:org,user_id:users[0],role_key:'org_owner',status:'active'}));
  check(await db.from('store_memberships').insert([{organization_id:org,store_id:store,user_id:users[1],email:'manager@example.invalid',role_key:'store_manager',status:'active'},{organization_id:org,store_id:store,user_id:users[2],email:'staff@example.invalid',role_key:'staff',status:'active'}]));
  for(const actor of users.slice(1,4)) assert((await save(actor)).error,'non-owner cannot connect');
  assert((await save(users[0],otherStore)).error,'cross organization denied');
  connection=check(await save());
  assert((await save(users[4],otherStore)).error,'globally scoped provider store cannot bind to another store');
  assert((await save(users[0],store,'different-store')).error,'existing connection cannot silently change store');
  const signed=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${tokens.owner}`}}});
  assert((await signed.from('air_regi_connections').select('*')).error,'authenticated client cannot read encrypted credentials');
  assert((await signed.rpc('claim_air_regi_sync',{p_id:connection,p_spec:'SYNTHETIC-v1'})).error,'direct RPC denied even for owner');
  assert((await apply({lease_id:null},[sale()])).error,'unclaimed page must never apply');
  assert.equal(check(await db.rpc('claim_air_regi_sync',{p_id:connection,p_spec:null})),null,'spec version must be supplied');
  assert((await db.rpc('transition_air_regi_connection',{p_actor:users[0],p_store:store,p_id:connection,p_action:'pause',p_revision:null})).error);
  await forceDue();
  const leases=await Promise.all([claim(),claim()]); assert.equal(leases.filter(Boolean).length,1,'concurrent worker lock');
  const lease=leases.find(Boolean);
  assert((await apply(lease,[sale()],{p_external:'wrong-store'})).error);
  assert.equal((await versions()).length,0); assert.equal((await current()).watermark,null);
  assert.equal(check(await apply(lease,[sale()])).changed,1);
  assert.equal(Number((await totals())[0].gross_amount),1100);
  assert.equal((await claim()),null,'minimum interval enforced');
  await forceDue(); check(await apply(await claim(),[sale()])); assert.equal((await versions()).length,1,'replay no duplicate');
  await forceDue(); check(await apply(await claim(),[sale('sale-1','2026-10-14T09:10:00Z','sale',2200)]));
  assert.equal(Number((await totals())[0].gross_amount),2200,'revision updates existing projection');
  await forceDue(); check(await apply(await claim(),[sale()])); assert.equal(Number((await totals())[0].gross_amount),2200,'out-of-order stale revision ignored');
  const before=(await versions()).length;
  await forceDue(); const conflictLease=await claim();
  assert((await apply(conflictLease,[sale('sale-new'),sale('sale-1','2026-10-14T09:10:00Z','sale',3300)])).error,'same revision conflicting content held');
  assert.equal((await versions()).length,before,'whole page rollback including earlier valid row');
  check(await db.rpc('fail_air_regi_sync',{p_id:connection,p_lease:conflictLease.lease_id,p_code:'sync_failed'}));
  assert.equal((await current()).last_error_code,'sync_failed');
  assert(Date.parse((await current()).next_sync_at)>Date.now()+100000,'exponential backoff');
  await forceDue(); check(await apply(await claim(),[sale('refund-1','2026-10-14T09:11:00Z','refund')]));
  assert.equal(Number((await totals())[0].gross_amount),1100,'refund reduces revenue');
  await forceDue(); check(await apply(await claim(),[sale('refund-1','2026-10-14T09:12:00Z','void')]));
  assert.equal(Number((await totals())[0].gross_amount),2200,'refund cancellation restores revenue');
  await forceDue(); check(await apply(await claim(),[sale('sale-1','2026-10-14T09:13:00Z','void',2200)]));
  assert.equal((await totals()).length,0,'void excluded from revenue AND transaction count');
  const count=check(await db.from('sales_transactions').select('id',{count:'exact'}).eq('store_id',store).or('source_metadata->>air_regi_state.is.null,source_metadata->>air_regi_state.neq.void'));
  assert.equal(count.length,0,'report source-count filter excludes void');
  await forceDue(); check(await apply(await claim(),[sale('sale-1','2026-10-14T09:14:00Z','sale',2200)]));
  const legacyId=randomUUID();
  check(await db.from('sales_transactions').insert({id:legacyId,organization_id:org,store_id:store,source_row_hash:`synthetic-csv:${legacyId}`,transaction_date:'2026-10-13T09:00:00Z',business_date:'2026-10-13',gross_amount:350,tax_amount:30,net_amount:320,payment_method:'カード'}));
  await forceDue(); check(await apply(await claim(),[sale('sale-1','2026-10-14T09:15:00Z','sale',2200)]));
  assert.equal(Number((await totals())[0].gross_amount),2550,'existing CSV and API transactions coexist');
  assert.equal(Number((await totals())[0].transaction_count),2);
  await forceDue(); const revokedLease=await claim();
  check(await db.from('organization_members').update({status:'inactive'}).eq('organization_id',org).eq('user_id',users[0]));
  assert((await apply(revokedLease,[sale('unauthorized')])).error,'permission rechecked after fetch');
  await forceDue(); assert.equal(await claim(),null,'revoked owner stops background fetching');
  check(await db.from('organization_members').update({status:'active'}).eq('organization_id',org).eq('user_id',users[0]));
  for(const actor of users.slice(1,4)) assert((await transition('archive',actor)).error);
  const retained=(await versions()).length;
  check(await transition('pause')); await forceDue(); assert.equal(await claim(),null);
  check(await transition('resume')); check(await transition('archive'));
  assert.equal((await current()).encrypted_credentials,null,'local secret erased on disconnect');
  await forceDue(); assert.equal(await claim(),null);
  assert.equal((await versions()).length,retained,'immutable evidence retained');
  assert.equal(Number((await totals())[0].gross_amount),2550,'disconnect retains past business sales');
  assert((await save()).error,'archived connection must be restored first');
  check(await transition('restore')); assert.equal((await current()).status,'paused');
  assert((await transition('resume')).error,'restore does not implicitly authorize');
  check(await save()); check(await transition('pause',users[4]));
  // Final UI state intentionally paused and synthetic; production adapter absent.
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3202'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:secret,OPENAI_API_KEY:'',CRON_SECRET:'synthetic-cron-only'},stdio:['ignore','ignore','ignore']});
  let started=false;
  for(let n=0;n<100;n++){try{if((await fetch(`${base}/login`)).ok){started=true;break;}}catch{} await new Promise(r=>setTimeout(r,500));}
  assert(started,'local test server did not start');
  const cron=await fetch(`${base}/api/cron/airregi-sync`,{headers:{authorization:'Bearer synthetic-cron-only'}});
  assert.equal(cron.status,200); assert.equal((await cron.json()).status,'awaiting_connection_setup');
  assert.equal((await fetch(`${base}/api/cron/airregi-sync`)).status,401);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext(); const page=await context.newPage(); page.setDefaultTimeout(30000);
  const signIn=async role=>{await context.clearCookies();await context.addCookies([{name:'aio_auth_access_token',value:tokens[role],url:base,httpOnly:true,sameSite:'Lax'}]);};
  const path=`${base}/stores/${store}/settings/integrations/airregi`;
  await mkdir(evidence,{recursive:true}); await signIn('owner');
  for(const [width,height] of [[1440,1000],[390,844]]){
    await page.setViewportSize({width,height}); await page.goto(path); await page.getByRole('heading',{name:'Airレジ連携',exact:true}).waitFor();
    await page.locator('select').first().getByRole('option',{name:'Airレジ動作確認専用',exact:true}).waitFor({state:'attached'});
    assert.equal(await page.locator('input[type=password]').count(),0,'no premature credential collection');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`);
    await page.screenshot({path:`${evidence}/owner-${width}.png`,fullPage:true});
  }
  page.once('dialog',d=>d.accept()); await page.getByRole('button',{name:'接続を削除',exact:true}).click();
  await page.getByRole('status').filter({hasText:'削除済みに移しました'}).waitFor();
  await page.getByText('削除済みの接続',{exact:true}).click(); await page.getByRole('button',{name:'元に戻す',exact:true}).click();
  await page.getByRole('status').filter({hasText:'元に戻しました'}).waitFor();
  for(const role of ['manager','staff','none']){
    await signIn(role);
    try { await page.goto(path,{waitUntil:'domcontentloaded'}); }
    catch(error) { if(!error.message.includes('interrupted by another navigation')) throw error; }
    await page.getByRole('heading',{name:/この画面を表示する権限がありません|ページが見つかりません/}).waitFor();
    assert(!await page.getByRole('heading',{name:'Airレジ連携',exact:true}).count(),`${role} must not view owner integration settings`);
  }
  await signIn('admin'); await page.goto(path); await page.getByRole('heading',{name:'Airレジ連携',exact:true}).waitFor();
  console.log(`PASS staging Airレジ: owner/admin, staff/manager/foreign denial, RLS, lease, replay, stale/conflicting revisions, atomic rollback, refund/void, backoff, archive/restore, revoked permission, cron gate, mobile/desktop UI. Evidence: ${evidence}`);
} finally {
  if(browser) await browser.close(); if(server) server.kill('SIGTERM');
  // Only explicitly created synthetic fixture IDs. Immutable production history
  // is never removed. Management API cleanup because service has no delete grant.
  const fixtureIds=[org,otherOrg]; fixtureIds.forEach(id=>assert(/^[0-9a-f-]{36}$/.test(id)));
  const list=fixtureIds.map(id=>`'${id}'`).join(',');
  const cleanup=`begin; delete from public.air_regi_transaction_versions where connection_id in(select id from public.air_regi_connections where organization_id in(${list})); delete from public.air_regi_connections where organization_id in(${list}); delete from public.organizations where id in(${list}) and name like 'AIRREGI SYNTHETIC%'; commit;`;
  execFileSync('/opt/homebrew/bin/supabase',['db','query','--linked',cleanup,'--workdir',workdir,'--output','json'],{stdio:['ignore','pipe','pipe']});
  for(const user of users) check(await db.auth.admin.deleteUser(user));
}
