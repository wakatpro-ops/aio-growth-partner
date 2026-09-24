// Explicit staging-only synthetic acceptance. Secrets live in process memory only.
import { execFileSync,spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
const ref='zlqqjifitnvorudxbepy';
const base=process.env.MENU_TEST_BASE_URL??'http://localhost:3187';
assert(['http://localhost:3187','https://staging.aioboost.jp'].includes(base),'Only designated staging or local is allowed');
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='aio_staging_vercel'&&k.type==='secret')?.api_key??keys.find(k=>k.type==='secret')?.api_key;
const anon=keys.find(k=>k.type==='publishable')?.api_key;
assert(secret&&anon,'Staging keys required');
const url=`https://${ref}.supabase.co`;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const login=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const org=randomUUID(),store=randomUUID(),item=randomUUID();
const users=[];let server,browser;
const check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const evidence='/private/tmp/aio-menu-workbench-ui';
await mkdir(evidence,{recursive:true});
try {
  const tokens={};
  for(const role of ['owner','staff','none']) {
    const email=`menu-${randomUUID()}@example.invalid`,password=`${randomUUID()}!aA9`;
    const user=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user;
    users.push(user.id);
    check(await db.from('user_profiles').upsert({user_id:user.id,display_name:`UI ${role}`,role:'user',status:'active'}));
    tokens[role]=check(await login.auth.signInWithPassword({email,password})).session.access_token;
  }
  check(await db.from('organizations').insert({id:org,name:'MENU UI SYNTHETIC',status:'active'}));
  check(await db.from('stores').insert({id:store,organization_id:org,industry_type_key:'restaurant',name:'動作確認専用レストラン',status:'active'}));
  check(await db.from('organization_members').insert({organization_id:org,user_id:users[0],role_key:'org_owner',status:'active'}));
  check(await db.from('store_memberships').insert({organization_id:org,store_id:store,user_id:users[1],email:'staff@example.invalid',role_key:'staff',status:'active'}));
  check(await db.from('items').insert({id:item,organization_id:org,store_id:store,industry_type_key:'restaurant',name:'確認用ハンバーグ',unit:'個',unit_price:1100,cost_price:350,is_stock_managed:true,metadata:{tax_inclusion:'inclusive'}}));
  check(await db.from('inventory_stocks').insert({store_id:store,organization_id:org,item_id:item,quantity:4,reorder_point:5}));
  if(base==='http://localhost:3187') server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3187'],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:secret,OPENAI_API_KEY:''},stdio:['ignore','ignore','ignore']});
  for(let n=0;n<120;n++){try{await fetch(`${base}/login`);break;}catch{await new Promise(r=>setTimeout(r,500));}}
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext();
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  const signIn=async role=>{await context.clearCookies();await context.addCookies([{name:'aio_auth_access_token',value:tokens[role],url:base,httpOnly:true,sameSite:'Lax'}]);};
  await signIn('owner');
  await page.goto(`${base}/stores/${store}/items/${item}`);
  await page.locator('input[name=unit_price]').fill('1200');
  page.once('dialog',dialog=>dialog.accept());
  const actionRequest=page.waitForRequest(request=>request.method()==='POST'&&request.url().includes(`/items/${item}`));
  await page.getByRole('button',{name:'変更を保存',exact:true}).click();
  const captured=await actionRequest;
  const replayBody=captured.postDataBuffer(),replayHeaders=captured.headers();
  await page.getByText('保存しました。',{exact:true}).waitFor();
  assert.equal(Number(check(await db.from('items').select('unit_price').eq('id',item).single()).unit_price),1200);
  for(const [width,height]of [[1440,1000],[390,844]]) {
    await page.setViewportSize({width,height});
    for(const tab of ['menu','stock','analysis']) {
      await page.goto(`${base}/stores/${store}/inventory?tab=${tab}`);
      await page.getByRole('navigation',{name:'商品と在庫の切り替え'}).waitFor();
      await page.locator('select').first().getByRole('option',{name:'動作確認専用レストラン',exact:true}).waitFor({state:'attached'});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`overflow ${tab}/${width}`);
      await page.screenshot({path:`${evidence}/${tab}-${width}.png`,fullPage:true});
    }
  }
  await signIn('staff');
  const replay=await context.request.post(`${base}/stores/${store}/items/${item}`,{data:replayBody,headers:{'content-type':replayHeaders['content-type'],'next-action':replayHeaders['next-action'],origin:base}});
  assert(replay.status()>=400,'staff action replay must fail');
  assert.equal(Number(check(await db.from('items').select('unit_price').eq('id',item).single()).unit_price),1200);
  await page.goto(`${base}/stores/${store}/inventory`);
  assert.equal(await page.getByRole('link',{name:'写真・価格などを編集'}).count(),0);
  assert.equal(await page.getByRole('link',{name:'売れ方・利益',exact:true}).count(),0);
  await page.getByText('販売状態を変える',{exact:true}).click();
  await page.locator('select[name=availability]').selectOption('sold_out');
  await page.getByRole('button',{name:'状態を保存',exact:true}).click();
  await page.getByRole('status').filter({hasText:'販売状態を保存しました'}).waitFor();
  assert.equal(check(await db.from('items').select('availability').eq('id',item).single()).availability,'sold_out');
  await page.goto(`${base}/stores/${store}/inventory/documents/new`);
  await page.locator('select[name=item_id]').selectOption(item);
  await page.locator('input[name=quantity]').fill('2');
  await page.getByRole('button',{name:'保存して最終確認へ'}).click();
  await page.getByRole('button',{name:'確認して在庫に反映'}).waitFor();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'確認して在庫に反映'}).click();
  await page.getByText('在庫へ反映しました。履歴に記録されています。',{exact:true}).waitFor();
  assert.equal(Number(check(await db.from('inventory_stocks').select('quantity').eq('item_id',item).single()).quantity),6);
  await page.screenshot({path:`${evidence}/receipt-confirmed-390.png`,fullPage:true});
  for(const path of [`inventory?tab=analysis`,`items/${item}`,`inventory/documents/new?kind=purchase`]) {
    await page.goto(`${base}/stores/${store}/${path}`);
    assert.equal(await page.locator('input[name=cost_price]').count(),0);
    assert.equal(await page.getByRole('heading',{name:'売れ方を確認'}).count(),0);
    assert.equal(await page.getByRole('button',{name:'保存して最終確認へ'}).count(),0);
  }
  await signIn('none');
  await page.goto(`${base}/stores/${store}/inventory`);
  assert.equal(await page.getByRole('heading',{name:'確認用ハンバーグ'}).count(),0);
  console.log(JSON.stringify({passed:true,checks:['desktop/mobile 3 tabs no overflow','staff price/analysis/purchase denied','staff availability persisted','receipt UI + DB verified','authenticated no-membership denied'],screenshots:evidence}));
} finally {
  await browser?.close();server?.kill('SIGTERM');
  // These IDs were generated above solely for this run. Do not delete existing records.
  for(const table of ['audit_logs','stock_documents','inventory_movements','inventory_stocks','items','store_memberships']) check(await db.from(table).delete().eq('store_id',store));
  check(await db.from('stores').delete().eq('id',store));
  check(await db.from('organization_members').delete().eq('organization_id',org));
  check(await db.from('organizations').delete().eq('id',org));
  for(const id of users)check(await db.auth.admin.deleteUser(id));
  console.log('Synthetic fixtures removed; no customer records modified.');
}
