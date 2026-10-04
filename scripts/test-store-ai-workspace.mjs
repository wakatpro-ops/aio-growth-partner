// Browser regression against synthetic staging fixtures only. Never production data.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const local = process.argv.includes("--local");
const base = local ? "http://127.0.0.1:3193" : "https://staging.aioboost.jp";
const ref = "zlqqjifitnvorudxbepy";
const keys = JSON.parse(execFileSync("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"], { encoding:"utf8", stdio:["ignore","pipe","pipe"] }));
const secret = keys.find(k => k.name === "aio_staging_vercel" && k.type === "secret")?.api_key;
const anon = keys.find(k => k.type === "publishable")?.api_key;
assert(secret && anon);
const db = createClient(`https://${ref}.supabase.co`, secret, { auth:{ persistSession:false, autoRefreshToken:false } });
const checked = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const org = randomUUID(), foreignOrg = randomUUID(), store = randomUUID(), second = randomUUID(), foreign = randomUUID();
const users = {}, results = [], directory = `test-results/store-ai-${local ? "local" : "staging"}`;
let browser, server;
const pass = name => { console.log(`PASS ${name}`); results.push({ name, passed:true }); };
const routes = ["", "/sales-hub", "/customers", "/inventory", "/reviews", "/settings", "/invoices/new", "/marketing", "/marketing/aio-improvement"];
async function open(page, path) {
  await page.goto(`${base}${path}`, { timeout:60000 });
  await page.locator(".store-workspace .main").waitFor({ timeout:30000 });
  await page.locator(".sidebar-account").waitFor();
  await page.locator(".brand-name").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth,
    offenders:[...document.querySelectorAll("main *")].filter(el => {
      const r=el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(el).position !== "absolute";
    }).slice(0,8).map(el => `${el.tagName}.${el.className}`) }));
  assert(overflow.scroll <= overflow.width + 1, `${label}: ${JSON.stringify(overflow)}`);
}
try {
  await mkdir(directory, { recursive:true });
  if (local) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3193"], {
      env:{ ...process.env, NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY:anon, SUPABASE_SERVICE_ROLE_KEY:secret }, stdio:["ignore","pipe","pipe"]
    });
    server.stdout.on("data",()=>{}); server.stderr.on("data",()=>{});
    let ready=false;
    for(let i=0;i<60;i++) { try { if((await fetch(`${base}/login`)).ok) {ready=true;break;} } catch {} await new Promise(r=>setTimeout(r,1000)); }
    assert(ready,"local ready");
  }
  checked(await db.from("organizations").insert([org,foreignOrg].map(id=>({id,name:"AI WORKSPACE SYNTHETIC",status:"active"}))));
  checked(await db.from("stores").insert([
    {id:store,organization_id:org,name:"【動作検証用】ハーブピーリング＆アロマサロン AI相談テスト店舗"},
    {id:second,organization_id:org,name:"動作検証用２号店"},
    {id:foreign,organization_id:foreignOrg,name:"動作検証用他法人"}
  ].map(row=>({...row,industry_type_key:"beauty_salon",status:"active"}))));
  for(const role of ["owner","staff","viewer"]) {
    const email=`ai-workspace-${role}-${randomUUID()}@example.invalid`, password=`${randomUUID()}Aa9!`;
    const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true})).user;
    users[role]={id:user.id,email};
    checked(await db.from("user_profiles").upsert({user_id:user.id,display_name:"AI相談 動作検証",role:"user",status:"active"}));
    const client=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    users[role].token=checked(await client.auth.signInWithPassword({email,password})).session.access_token;
    if(role==="owner") checked(await db.from("organization_members").insert({organization_id:org,user_id:user.id,role_key:"org_owner",status:"active"}));
    else checked(await db.from("store_memberships").insert({organization_id:org,store_id:store,user_id:user.id,email,role_key:role,status:"active",invitation_status:"accepted"}));
  }
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  await context.addCookies([{name:"aio_auth_access_token",value:users.owner.token,url:base,httpOnly:true,sameSite:"Lax"}]);
  const page=await context.newPage();
  const errors=[]; page.on("pageerror",e=>errors.push(e.message));
  for(const width of [1920,1366,390]) {
    await page.setViewportSize({width,height:900});
    for(const route of routes) {
      await open(page,`/stores/${store}${route}`);
      await noOverflow(page,`${width}${route}`);
      assert.equal(await page.locator(".store-ai-workspace").count(),1);
      assert.equal(await page.locator(".nav-ai-button, .store-ai-assistant-layer").count(),0);
      if(width>=1280) {
        await expect(page.locator("#store_ai_question")).toBeVisible();
        const main=await page.locator(".main").boundingBox(), ai=await page.locator(".store-ai-workspace").boundingBox();
        assert(main.x+main.width<=ai.x+1,"rail does not overlap business page");
      } else {
        await expect(page.locator(".store-ai-mobile-toggle")).toBeVisible();
        await expect(page.locator("#store_ai_question")).toBeHidden();
      }
      if(route==="") {
        assert.equal(await page.locator(".command-focus-strip, .command-shortcuts, .main .topbar, .main .ai-robot-portrait").count(),0);
        const tasks=await page.locator(".command-task-column").boundingBox();
        if(width>=1280) assert(tasks.y<60,"today's tasks immediately visible");
      }
      if(route==="/reviews") await expect(page.locator('.nav[aria-label="main"] a[aria-current="page"]')).toHaveText("Google口コミ");
      await page.screenshot({path:`${directory}/${width}-${route.replaceAll("/","-")||"home"}.png`,fullPage:false});
      pass(`layout ${width}px ${route||"home"}`);
    }
  }
  for(const width of [320,768,1024,1280]) {
    await page.setViewportSize({width,height:820});
    await open(page,`/stores/${store}`); await noOverflow(page,`home ${width}`);
    if(width<1280) {
      await page.locator(".store-ai-mobile-toggle").click();
      await expect(page.locator("#store_ai_question")).toBeVisible();
      await noOverflow(page,`expanded ${width}`);
      const ai=await page.locator(".store-ai-workspace").boundingBox();
      assert(ai.y>=0 && ai.y+ai.height<=821,"expanded chat inside viewport");
      await page.screenshot({path:`${directory}/${width}-expanded.png`});
      await page.locator(".store-ai-mobile-toggle").click();
      await expect(page.locator("#store_ai_question")).toBeHidden();
    }
    pass(`responsive home + AI dock ${width}px`);
  }
  await page.setViewportSize({width:390,height:400});
  await open(page,`/stores/${store}`);
  await page.locator(".store-ai-mobile-toggle").click();
  const send=await page.locator(".store-ai-conversation button[type=submit]").boundingBox();
  assert(send.y>=0 && send.y+send.height<=400,"short viewport keeps send button on screen");
  await page.screenshot({path:`${directory}/390-short-expanded.png`});
  pass("short mobile viewport keeps composer accessible");
  await page.setViewportSize({width:1366,height:900});
  await open(page,`/stores/${store}`);
  const requests=[];
  let failNext=false, release;
  await page.route("**/api/stores/*/assistant",async route=>{
    if(route.request().method()!=="POST")return route.continue();
    const payload=route.request().postDataJSON(); requests.push(payload);
    if(failNext) {failNext=false;await route.fulfill({status:503,json:{error:"test"}});return;}
    if(["二重送信テスト","作業を続ける相談"].includes(payload.message)) await new Promise(resolve=>{release=resolve;});
    await route.fulfill({json:{answer:`確認しました: ${payload.message}\n${"回答 ".repeat(500)}`}});
  });
  await page.locator("#store_ai_question").fill("二重送信テスト");
  await page.locator(".store-ai-conversation form").evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  await expect.poll(()=>requests.length).toBe(1);
  await expect(page.locator("#store_ai_question")).toBeDisabled();
  release(); await expect(page.locator(".store-ai-message.assistant")).toHaveCount(1);
  pass("synchronous duplicate prevention and immediate busy feedback");
  await page.locator("#store_ai_question").fill("編集中の相談");
  await page.locator('.nav[aria-label="main"]').getByRole("link",{name:"Google口コミ",exact:true}).click();
  await page.waitForURL(`**/stores/${store}/reviews`);
  await expect(page.locator("#store_ai_question")).toHaveValue("編集中の相談");
  await expect(page.locator(".store-ai-message.assistant")).toHaveCount(1);
  await page.locator(".store-ai-conversation form").evaluate(form=>form.requestSubmit());
  await expect.poll(()=>requests.length).toBe(2);
  assert.equal(requests[1].pathname,`/stores/${store}/reviews`);
  assert(requests[1].history.every(m=>m.content.length<=1200));
  await expect(page.locator(".store-ai-message.assistant")).toHaveCount(2);
  pass("same-store navigation preserves draft/history and updates page context; bounded history");
  failNext=true;
  await page.locator("#store_ai_question").fill("再送できる相談");
  await page.locator(".store-ai-conversation form").evaluate(form=>form.requestSubmit());
  await expect(page.locator(".store-ai-error")).toBeVisible();
  await expect(page.locator("#store_ai_question")).toHaveValue("再送できる相談");
  await page.locator(".store-ai-conversation form").evaluate(form=>form.requestSubmit());
  await expect(page.locator(".store-ai-message.assistant")).toHaveCount(3);
  pass("error restores question and retry works without duplicate history");
  await page.setViewportSize({width:390,height:844});
  await page.locator(".store-ai-mobile-toggle").click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("aio:ask",{detail:"メニューの相談"})));
  await expect(page.locator("#store_ai_question")).toBeVisible();
  await expect(page.locator("#store_ai_question")).toHaveValue("メニューの相談");
  await expect(page.locator("#store_ai_question")).toBeFocused();
  assert.equal(requests.length,4,"prefill must not auto-send");
  pass("existing contextual ask buttons open mobile AI and prefill without sending");
  await page.setViewportSize({width:1366,height:900});
  await page.locator("#store_ai_question").fill("作業を続ける相談");
  await page.locator(".store-ai-conversation form").evaluate(form=>form.requestSubmit());
  await expect.poll(()=>requests.length).toBe(5);
  const businessLink=page.locator('.nav[aria-label="main"]').getByRole("link",{name:"Google口コミ",exact:true});
  await businessLink.focus();
  release();
  await expect(page.locator(".store-ai-message.assistant")).toHaveCount(4);
  await expect(businessLink).toBeFocused();
  pass("AI reply does not steal focus from business controls");
  await page.locator("#sidebar_store_switcher").selectOption(second);
  await page.waitForURL(`**/stores/${second}/reviews`);
  await expect(page.locator(".store-ai-messages")).toHaveText("");
  await expect(page.locator("#store_ai_question")).toHaveValue("");
  pass("store switch resets conversation and preserves reviews navigation");
  await page.goto(`${base}/stores`);
  await expect(page.locator(".store-ai-workspace")).toHaveCount(0);
  await page.goto(`${base}/login`);
  await expect(page.locator(".store-ai-workspace")).toHaveCount(0);
  pass("no store conversation on store selector or public login");
  assert.equal(errors.length,0,errors.join("\n"));
  await context.close();
  for(const role of ["staff","viewer"]) {
    const ctx=await browser.newContext({viewport:{width:1366,height:900}});
    await ctx.addCookies([{name:"aio_auth_access_token",value:users[role].token,url:base,httpOnly:true,sameSite:"Lax"}]);
    const p=await ctx.newPage(); await open(p,`/stores/${store}`);
    assert.equal(await p.getByRole("link",{name:"管理者トップ",exact:true}).count(),0);
    const denied=await p.request.post(`${base}/api/stores/${foreign}/assistant`,{data:{pathname:`/stores/${foreign}`,message:"test"}});
    assert([403,404].includes(denied.status()));
    const invalid=await p.request.post(`${base}/api/stores/${store}/assistant`,{data:{pathname:`/stores/${store}`,message:""}});
    assert.equal(invalid.status(),400,"own-store read-only assistant accessible; validation applies");
    await ctx.close(); pass(`${role}: own-store AI and other-tenant rejection`);
  }
  const unauth=await fetch(`${base}/api/stores/${store}/assistant`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pathname:`/stores/${store}`,message:"test"})});
  assert.equal(unauth.status,401); pass("unauthenticated assistant rejected");
} finally {
  await browser?.close(); server?.kill("SIGTERM");
  const failures=[];
  for(const id of [org,foreignOrg]) {const r=await db.from("organizations").delete().eq("id",id);if(r.error)failures.push(r.error.message);}
  for(const user of Object.values(users)) {const r=await db.auth.admin.deleteUser(user.id);if(r.error)failures.push(r.error.message);}
  const remaining=checked(await db.from("organizations").select("id").in("id",[org,foreignOrg]));
  const cleanup=!failures.length&&!remaining.length;
  await writeFile(`${directory}/results.json`,JSON.stringify({base,results,cleanup},null,2));
  console.log(`Synthetic fixture cleanup: ${cleanup?"PASS":"FAIL"}`); assert(cleanup,failures.join("\n"));
}
