// Real modules with synthetic tokens only. This script does not call Meta, AI or email services.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  file = resolve(file);
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", source)(name => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith(".")) return load(resolve(dirname(file), `${name}.ts`), mocks);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const policy = load("lib/instagram/policy.ts");
const secrets = load("lib/instagram/secrets.ts");
const { InstagramClient } = load("lib/instagram/client.ts");
const callback = "https://app.aioboost.jp/api/instagram/oauth/callback";
const state = crypto.randomBytes(32).toString("base64url");
const url = new URL(policy.instagramAuthorizationUrl("1069884112049122", callback, state));
assert.equal(url.hostname, "www.instagram.com");
assert.equal(url.searchParams.get("enable_fb_login"), "false");
assert.equal(url.searchParams.get("force_reauth"), "true");
assert.deepEqual(url.searchParams.get("scope").split(","), ["instagram_business_basic", "instagram_business_content_publish"]);
assert.equal(policy.verifyInstagramState(state, state), policy.instagramStateHash(state));
for (const [value,cookie] of [[null,state],[state,undefined],[state,"x".repeat(43)],["あ".repeat(43),state],[state,"あ".repeat(43)]]) assert.throws(() => policy.verifyInstagramState(value,cookie));
for (const bad of ["http://app.aioboost.jp/api/instagram/oauth/callback",callback+"?redirect=other",callback+"#token","https://user:pass@app.aioboost.jp/api/instagram/oauth/callback","https://app.aioboost.jp/api/meta/oauth/callback"]) assert.throws(()=>policy.instagramRedirectUri(bad));
assert.equal(policy.instagramLoginAllowed("store",{INSTAGRAM_LOGIN_ENABLED:"true",INSTAGRAM_LOGIN_TEST_STORE_IDS:"review-store"}),false);
assert.equal(policy.instagramLoginAllowed("review-store",{INSTAGRAM_LOGIN_ENABLED:"true",INSTAGRAM_LOGIN_TEST_STORE_IDS:"review-store"}),true);
assert.equal(policy.instagramLoginAllowed("store",{INSTAGRAM_LOGIN_ENABLED:"true",INSTAGRAM_ADVANCED_ACCESS_APPROVED:"true"}),true);
assert.equal(policy.instagramLoginAllowed("store",{INSTAGRAM_LOGIN_ENABLED:"false",INSTAGRAM_ADVANCED_ACCESS_APPROVED:"true"}),false);

const priorKey = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY;
process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY = "synthetic-test-key-never-a-provider-secret";
try {
  const cipher = secrets.encryptInstagramToken("synthetic-token","org","store");
  assert(!cipher.includes("synthetic-token"));
  assert.equal(secrets.decryptInstagramToken(cipher,"org","store"),"synthetic-token");
  for(const [org,store] of [["other","store"],["org","other"]]) assert.throws(()=>secrets.decryptInstagramToken(cipher,org,store));
  assert.throws(()=>secrets.decryptInstagramToken(cipher.slice(0,-10)+"tampered","org","store"));
} finally { if(priorKey===undefined) delete process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY; else process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY=priorKey; }

const legacy={id:"legacy",organization_id:"org",store_id:"store",channel:"instagram",external_provider:"meta",external_account_id:"178411111",access_token_encrypted:"synthetic",connection_status:"connected",token_expires_at:null};
const direct={...legacy,id:"direct",external_provider:"instagram_login",external_account_id:"178422222",scopes:[...policy.INSTAGRAM_LOGIN_SCOPES],token_expires_at:new Date(Date.now()+86_400_000).toISOString(),metadata:{connection_generation:"generation-1"}};
assert.equal(policy.preferredPublishingAccount([legacy,direct],"instagram").id,"direct");
assert.equal(policy.preferredPublishingAccount([legacy,{...direct,connection_status:"disconnected"}],"instagram").id,"direct");
assert.equal(policy.publishingAccountReady(direct),true);
assert.equal(policy.publishingAccountConnected({...direct,access_token_encrypted:undefined}),true,"AI context checks only public projection");
assert.equal(policy.publishingAccountConnected(policy.preferredPublishingAccount([legacy,{...direct,connection_status:"disconnected"}],"instagram")),false,"AI must not silently fall back to another Instagram identity");
assert.equal(policy.publishingAccountReady({...direct,token_expires_at:null}),false);
assert.equal(policy.publishingAccountReady({...direct,scopes:["instagram_business_basic"]}),false);
assert.equal(policy.publishingAccountReady({...direct,token_expires_at:"invalid"}),false);
const fb={...legacy,id:"fb",channel:"facebook"};
assert.equal(policy.preferredPublishingAccount([direct,fb],"facebook").id,"fb");
const binding=policy.publishingConnectionSnapshot(direct);
policy.assertPublishingConnection(direct,binding,direct.external_account_id);
for(const changed of [{...direct,id:"different"},{...direct,external_account_id:"178433333"},{...direct,metadata:{connection_generation:"generation-2"}}]) assert.throws(()=>policy.assertPublishingConnection(changed,binding,direct.external_account_id));
policy.assertPublishingConnection(legacy,{},legacy.external_account_id);
assert.throws(()=>policy.assertPublishingConnection(legacy,{},"other-page"));

let requests=[];
function mockedClient({shortArray=true,permissions=policy.INSTAGRAM_LOGIN_SCOPES.join(","),profileArray=true,accountType="BUSINESS",failAt="",multiple=false,unsafeNumericId=false}={}) {
  return new InstagramClient("1069884112049122","synthetic-app-secret","v26.0",async(input,init)=>{
    const url=new URL(input); requests.push({url,init});
    if(failAt && url.pathname.includes(failAt)) return new Response(JSON.stringify({error:{message:"synthetic-app-secret synthetic-token"}}),{status:400});
    let result;
    if(url.hostname==="api.instagram.com") {
      assert.equal(init.method,"POST"); assert.equal(init.body.get("client_id"),"1069884112049122"); assert.equal(init.body.get("redirect_uri"),callback);
      const short={access_token:"synthetic-short-token",user_id:"app-scoped-id",permissions}; result=shortArray?{data:[short]}:short;
    } else if(url.pathname==="/access_token") {
      assert.equal(url.searchParams.get("grant_type"),"ig_exchange_token"); result={access_token:"synthetic-long-token",expires_in:5_184_000};
    } else if(url.pathname.endsWith("/me")) {
      assert.equal(init.headers.Authorization,"Bearer synthetic-long-token");
      if(unsafeNumericId) return new Response('{"data":[{"id":"app-scoped-id","user_id":17841406221578652,"username":"synthetic_review","account_type":"BUSINESS"}]}',{status:200});
      const profile={id:"app-scoped-id",user_id:"178422222",username:"synthetic_review",account_type:accountType}; result=profileArray?{data:multiple?[profile,profile]:[profile]}:profile;
    } else if(url.pathname==="/refresh_access_token") result={access_token:"synthetic-refreshed",expires_in:5_184_000};
    else if(url.pathname.endsWith("/media_publish")) {assert.equal(url.hostname,"graph.instagram.com");assert.equal(init.headers.Authorization,"Bearer synthetic-long-token"); result={id:"179400001"};}
    else throw new Error("Unexpected request");
    return new Response(JSON.stringify(result),{status:200});
  });
}
assert.equal((await mockedClient({unsafeNumericId:true}).exchangeCode("synthetic-code",callback)).userId,"17841406221578652","unsafe JSON numeric identifiers preserve exact digits");
for(const options of [{},{shortArray:false,profileArray:false},{accountType:"MEDIA_CREATOR"}]) {
  const identity=await mockedClient(options).exchangeCode("synthetic-code",callback);
  assert.equal(identity.userId,"178422222","publish with Instagram professional ID, not app-scoped ID");
  assert.equal(identity.token,"synthetic-long-token");
}
await assert.rejects(()=>mockedClient({permissions:"instagram_business_basic"}).exchangeCode("code",callback),/両方/);
await assert.rejects(()=>mockedClient({multiple:true}).exchangeCode("code",callback),/一つ/);
await assert.rejects(()=>mockedClient({accountType:"PERSONAL"}).exchangeCode("code",callback),/プロアカウント/);
await assert.rejects(()=>mockedClient({failAt:"oauth"}).exchangeCode("code",callback),error=>!error.message.includes("synthetic"));
const before=requests.length;
await assert.rejects(()=>mockedClient().post("https://example.com","token",{}));
assert.equal(requests.length,before);
assert.equal((await mockedClient().post("178422222/media_publish","synthetic-long-token",{creation_id:"179400000"})).id,"179400001");
assert.equal((await mockedClient().refresh("synthetic-long-token")).token,"synthetic-refreshed");
assert.equal(requests.some(request=>request.url.hostname==="graph.facebook.com"),false);

const service=readFileSync("lib/phase5/sns-publishing.ts","utf8");
assert.match(service,/connection_provider \?\? "meta"/);
assert.match(service,/\.eq\("external_provider", "meta"\)\.in\("channel", \["meta_oauth", "facebook", "instagram"\]\)/);
assert.match(service,/directInstagram \? "permalink"/);
assert.match(service,/instagramLoginAllowed/);
const sql=readFileSync("supabase/migrations/202610150001_instagram_direct_login.sql","utf8");
assert.match(sql,/consumed_at is not null/);
assert.match(sql,/completed_at is not null/);
assert.match(sql,/a\.updated_at is distinct from attempt\.expected_updated_at/);
assert.match(sql,/from public,anon,authenticated/);
assert.match(sql,/menu_actor_allowed\(p_actor/);
assert.match(sql,/before insert or update or delete/);
console.log("PASS Instagram Login: minimum scopes, Facebook-free URL, browser-bound state, rollout gates, tenant-bound encryption, token formats, professional account ID/type, sanitized errors, refresh, provider routing and connection-bound publication");
