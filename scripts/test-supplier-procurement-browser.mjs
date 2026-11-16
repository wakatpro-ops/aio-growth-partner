// Guest-boundary and mobile smoke checks against a local production build.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const port=process.env.AIOB_PROCUREMENT_TEST_PORT??'39164';
const origin=`http://127.0.0.1:${port}`;
const id='b9c85416-6368-403c-97a7-83ec133dc4fb';
const order='83c4c258-1d5e-456c-8dd0-564dd51a2756';
const invoice='b2732bf3-ff2f-4864-bb8d-fef49066184a';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',port],{
  stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',SENDGRID_API_KEY:''}
});
let browser;
try {
  let ready=false;
  for(let i=0;i<50;i++) {
    if(child.exitCode!==null) throw new Error('Local app could not start.');
    try { ready=(await fetch(`${origin}/supplier/${id}`)).ok; } catch { /* wait for local app */ }
    if(ready) break;
    await delay(200);
  }
  assert(ready,'Local app did not respond.');
  browser=await chromium.launch(process.env.AIOB_CHROMIUM_CHANNEL?{channel:process.env.AIOB_CHROMIUM_CHANNEL}:{});
  const page=await browser.newPage({ viewport:{width:375,height:800} });
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const base=`${origin}/supplier/${id}`;
  await page.goto(`${base}#code=${'a'.repeat(43)}`);
  await page.getByRole('heading',{name:'仕入先専用ログイン'}).waitFor();
  await page.getByRole('button',{name:'仕入先画面にログイン',exact:true}).waitFor();
  assert.equal(page.url(),base);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page overflows.');
  await page.getByRole('button',{name:'仕入先画面にログイン',exact:true}).click();
  await page.getByRole('alert').getByText('このリンクは無効か期限切れです。新しいリンクを受け取ってください。').waitFor();
  await page.getByRole('textbox',{name:'招待を受けたメールアドレス'}).fill('fixture@example.test');
  await page.getByRole('button',{name:'ログインリンクを受け取る'}).click();
  await page.getByRole('status').getByText('登録済みの場合、ログインメールをお送りします。受信箱をご確認ください。').waitFor();
  assert.equal((await page.request.get(`${base}/invoice/${order}/${invoice}`)).status(),404);
  await page.goto(`${origin}/stores/${id}/procurement`);
  await page.waitForURL(url=>url.pathname==='/login',{timeout:8000});
  console.log('PASS: mobile guest layout, invite fragment removal, generic reissue, login failure, authorization boundary');
} finally {
  await browser?.close();
  if(child.exitCode===null) child.kill();
}
