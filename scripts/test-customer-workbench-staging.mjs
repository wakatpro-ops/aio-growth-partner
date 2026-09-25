// Synthetic fixtures only, explicitly restricted to the existing staging project.
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
const ref='zlqqjifitnvorudxbepy',base=process.env.CUSTOMER_TEST_BASE_URL??'http://localhost:3187';
assert(['http://localhost:3187','https://staging.aioboost.jp'].includes(base));
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='aio_staging_vercel'&&k.type==='secret')?.api_key;
const anon=keys.find(k=>k.type==='publishable')?.api_key;
assert(secret&&anon,'Staging keys required');
const url=`https://${ref}.supabase.co`,db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}),login=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=randomUUID(),store=randomUUID(),otherOrg=randomUUID(),otherStore=randomUUID(),customer=randomUUID();
const users=[],tokens={};let server,browser,page;
const evidence='/private/tmp/aio-customer-workbench-ui';
const viewports=process.env.CUSTOMER_TEST_QUICK==='1'?[[1440,1000]]:[[1440,1000],[390,844],[320,740]];
await mkdir(evidence,{recursive:true});
try{
 for(const role of ['owner','viewer','none','suspended']){
  const email=`customer-${randomUUID()}@example.invalid`,password=`${randomUUID()}!aA9`;
  const u=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user;users.push(u.id);
  check(await db.from('user_profiles').upsert({user_id:u.id,display_name:`UI ${role}`,role:'user',status:role==='suspended'?'suspended':'active'}));
  tokens[role]=check(await login.auth.signInWithPassword({email,password})).session.access_token;
 }
 check(await db.from('organizations').insert([{id:org,name:'CUSTOMER UI SYNTHETIC',status:'active'},{id:otherOrg,name:'OTHER UI SYNTHETIC',status:'active'}]));
 check(await db.from('stores').insert([{id:store,organization_id:org,industry_type_key:'beauty_salon',name:'予約UI検証専用サロン',status:'active'},{id:otherStore,organization_id:otherOrg,industry_type_key:'restaurant',name:'別法人の非公開店舗',status:'active'}]));
 check(await db.from('organization_members').insert([{organization_id:org,user_id:users[0],role_key:'org_owner',status:'active'},{organization_id:org,user_id:users[1],role_key:'viewer',status:'active'},{organization_id:org,user_id:users[3],role_key:'org_owner',status:'active'}]));
 if(base.startsWith('http://localhost'))server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3187'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:secret,OPENAI_API_KEY:''},stdio:'ignore'});
 for(let n=0;n<120;n++){try{await fetch(`${base}/login`);break;}catch{await new Promise(r=>setTimeout(r,500));}}
 browser=await chromium.launch({headless:true});const context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(45000);
 const signIn=async role=>{await context.clearCookies();await context.addCookies([{name:'aio_auth_access_token',value:tokens[role],url:base,httpOnly:true,sameSite:'Lax'}]);};
 const go=async path=>{await page.goto(`${base}/stores/${store}/${path}`);await page.getByRole('navigation',{name:'予約・顧客・分析の切り替え'}).waitFor();await page.locator('select').first().getByRole('option',{name:'予約UI検証専用サロン',exact:true}).waitFor({state:'attached'});};
 await signIn('owner');
 for(const [width,height]of viewports){
  await page.setViewportSize({width,height});
  for(const tab of ['bookings','customers','analysis']){
   await go(`customers?tab=${tab}`);await page.getByTestId('data-preview').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`empty overflow ${tab}/${width}`);
   await page.screenshot({path:`${evidence}/empty-${tab}-${width}.png`,fullPage:true});
  }
 }
 assert.equal((await db.from('customers').select('id',{count:'exact',head:true}).eq('store_id',store)).count,0,'preview must not create customers');
 assert.equal((await db.from('bookings').select('id',{count:'exact',head:true}).eq('store_id',store)).count,0,'preview must not create bookings');
 await page.getByRole('button',{name:'後で設定',exact:true}).click();assert.equal(await page.getByTestId('data-preview').count(),0);
 await page.getByRole('button',{name:'表示イメージを見る',exact:true}).click();await page.getByTestId('data-preview').waitFor();
 for(const path of ['sales-hub','inventory?tab=stock','results']){
  await page.goto(`${base}/stores/${store}/${path}`);await page.getByTestId('data-preview').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`shared preview overflow ${path}`);
  await page.screenshot({path:`${evidence}/shared-${path.split('?')[0]}-320.png`,fullPage:true});
 }
 check(await db.from('customers').insert([{id:customer,organization_id:org,store_id:store,name:'検証顧客一号',visit_count:2,last_visit_date:'2026-06-01',assigned_staff_name:'検証担当'}, {id:randomUUID(),organization_id:org,store_id:store,name:'履歴なしのお客様',visit_count:0}]));
 await page.goto(`${base}/stores/${store}/bookings/new`);
 await page.locator('select[name=customer_id]').selectOption(customer);
 await page.locator('input[name=service_name]').fill('確認用の施術');
 const today=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 await page.locator('input[name=starts_at]').fill(`${today}T12:00`);await page.locator('input[name=ends_at]').fill(`${today}T13:00`);
 await page.getByRole('button',{name:'予約を登録',exact:true}).click();
 await page.waitForURL(/\/bookings\/[0-9a-f-]+\?saved/);
 const booking=page.url().match(/bookings\/([0-9a-f-]+)/)[1];
 await page.locator('input[name=service_name]').fill('変更後の施術');
  const request=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes(`/bookings/${booking}`));
  const responseDone=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes(`/bookings/${booking}`));
 await page.getByRole('button',{name:'予約の変更を保存',exact:true}).click();
  const captured=await request,replayBody=captured.postDataBuffer(),headers=captured.headers();
  // Vercel may keep the RSC stream open after the action succeeds. Verify persisted
  // state with a bounded poll rather than waiting indefinitely for stream EOF.
  await responseDone;
  for(let n=0;n<30;n++){if(check(await db.from('bookings').select('service_name').eq('id',booking).single()).service_name==='変更後の施術')break;await new Promise(r=>setTimeout(r,500));}
  await page.getByText('予約の変更を保存しました。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'予約の変更を保存',exact:true}).waitFor({state:'visible'});
 assert.equal(check(await db.from('bookings').select('service_name').eq('id',booking).single()).service_name,'変更後の施術');
 for(const [width,height]of viewports){
  await page.setViewportSize({width,height});
  for(const tab of ['bookings','customers','analysis']){
   await go(`customers?tab=${tab}`);assert.equal(await page.getByTestId('data-preview').count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`real overflow ${tab}/${width}`);
   await page.screenshot({path:`${evidence}/real-${tab}-${width}.png`,fullPage:true});
  }
 }
 await go('customers?tab=customers&q=no-such-customer');await page.getByText('条件に合うお客様がいません。絞り込みを解除して確認できます。').waitFor();assert.equal(await page.getByTestId('data-preview').count(),0);
 await go('customers?tab=bookings&view=day&date=2001-01-01');assert.equal(await page.getByTestId('data-preview').count(),0);
 await page.goto(`${base}/stores/${store}/customers/${customer}`);await page.getByRole('heading',{name:'予約・対応履歴'}).waitFor();assert.equal(await page.locator('input[name=name]').isVisible(),false);
 await page.getByText('基本情報を編集する',{exact:true}).click();await page.locator('input[name=name]').waitFor({state:'visible'});
 await page.goto(`${base}/stores/${store}/bookings/${booking}`);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'予約を削除',exact:true}).click();
 await page.waitForURL(/customers\?.*view=deleted/);
 await page.goto(`${base}/stores/${store}/bookings/${booking}?deleted=1`);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'元に戻す',exact:true}).click();await page.getByText('削除済みの予約を元に戻しました。',{exact:true}).waitFor();
 assert.equal(check(await db.from('bookings').select('archived_at').eq('id',booking).single()).archived_at,null);
 check(await db.from('customers').update({archived_at:new Date().toISOString()}).eq('store_id',store));
 await go('customers?tab=customers');await page.getByText('顧客はすべて削除済みです。「削除済み・復元」を確認してください。').waitFor();assert.equal(await page.getByTestId('data-preview').count(),0);
 check(await db.from('customers').update({archived_at:null}).eq('store_id',store));
 await signIn('viewer');await go('customers?tab=customers');assert.equal(await page.getByRole('button',{name:'削除',exact:true}).count(),0);
 await go('customers?tab=bookings');assert.equal(await page.getByRole('link',{name:'予約を登録',exact:true}).count(),0);
 for(const role of ['viewer','none','suspended']){
  await signIn(role);
  const response=await context.request.post(`${base}/stores/${store}/bookings/${booking}`,{data:replayBody,headers:{'content-type':headers['content-type'],'next-action':headers['next-action'],origin:base}});
  assert(response.status()>=400||response.headers()['x-action-redirect'],'forbidden action must fail or redirect');
  assert.equal(check(await db.from('bookings').select('service_name').eq('id',booking).single()).service_name,'変更後の施術');
  if(role!=='viewer'){await page.goto(`${base}/stores/${store}/customers`);assert.equal(await page.getByRole('navigation',{name:'予約・顧客・分析の切り替え'}).count(),0);}
 }
 await signIn('owner');await page.goto(`${base}/stores/${otherStore}/customers`);assert.equal(await page.getByRole('navigation',{name:'予約・顧客・分析の切り替え'}).count(),0);
 console.log(JSON.stringify({passed:true,viewports,checks:['empty/real 3 tabs no overflow','sample creates no records','skip/reopen','booking UI create/edit/archive/restore + DB + pending clears','customer history/edit collapse','filtered zero/period zero/archive-only not demo','viewer/none/suspended action replay denied','other organization denied'],evidence}));
}catch(error){if(page)await page.screenshot({path:`${evidence}/failure.png`,fullPage:true}).catch(()=>{});throw error;
}finally{
 await browser?.close();server?.kill('SIGTERM');
 // Only IDs generated by this test. Never clear real stores or users.
 for(const table of ['booking_resource_allocations','bookings','customer_notes','customers','audit_logs','store_memberships'])check(await db.from(table).delete().eq('store_id',store));
 for(const id of [store,otherStore])check(await db.from('stores').delete().eq('id',id));
 for(const id of [org,otherOrg]){check(await db.from('organization_members').delete().eq('organization_id',id));check(await db.from('organizations').delete().eq('id',id));}
 for(const id of users)check(await db.auth.admin.deleteUser(id));
 console.log('Synthetic fixtures removed.');
}
