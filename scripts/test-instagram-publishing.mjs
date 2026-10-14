import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
const require=createRequire(import.meta.url);
function load(file,mocks={}) {
  file=resolve(file);const mod={exports:{}};
  new Function("require","module","exports",ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{
    if(name in mocks) return mocks[name]; if(name==="server-only") return {};
    if(name.startsWith(".")) return load(resolve(dirname(file),`${name}.ts`),mocks);return require(name);
  },mod,mod.exports);return mod.exports;
}
const envNames=["SNS_TOKEN_ENCRYPTION_KEY","INSTAGRAM_TOKEN_ENCRYPTION_KEY","INSTAGRAM_LOGIN_ENABLED","INSTAGRAM_LOGIN_TEST_STORE_IDS"],prior=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
process.env.SNS_TOKEN_ENCRYPTION_KEY="synthetic-publish-test-key";process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY="synthetic-publish-test-key";process.env.INSTAGRAM_LOGIN_ENABLED="true";process.env.INSTAGRAM_LOGIN_TEST_STORE_IDS="store";
const policy=load("lib/instagram/policy.ts"),secrets=load("lib/instagram/secrets.ts");
let job,account,posts=0,legacyCalls=0,failPublish=false,failPermalink=false,authorized=true,revokeDuringPreparation=false;
function reset(provider="instagram_login") {
  account={id:"account",organization_id:"org",store_id:"store",channel:provider==="meta"?"facebook":"instagram",external_provider:provider,external_account_id:"17841400000000001",connection_status:"connected",token_expires_at:new Date(Date.now()+60*86_400_000).toISOString(),scopes:[...policy.INSTAGRAM_LOGIN_SCOPES],metadata:{connection_generation:"generation-1"}};
  if(provider==="instagram_login") account.access_token_encrypted=secrets.encryptInstagramToken("synthetic-instagram-token","org","store");
  else {const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",crypto.createHash("sha256").update(process.env.SNS_TOKEN_ENCRYPTION_KEY).digest(),iv);const encrypted=Buffer.concat([cipher.update("synthetic-facebook-token"),cipher.final()]);account.access_token_encrypted=`v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;}
  job={id:"job",organization_id:"org",store_id:"store",channel:account.channel,provider:"meta",growth_action_id:"action",status:"ready",target_id:account.external_account_id,scheduled_at:"2000-01-01T00:00:00Z",attempt_count:0,payload_json:{media_url:"https://example.invalid/image.jpg",caption:"SYNTHETIC",...policy.publishingConnectionSnapshot(account)}};
  posts=0;legacyCalls=0;failPublish=false;failPermalink=false;authorized=true;revokeDuringPreparation=false;
}
const db={
  rpc:async name=>{assert.equal(name,"validate_instagram_publish_connection");return {data:authorized,error:null};},
  from(table){const filters=[],query={patch:null,selected:false,select(){this.selected=true;return this;},eq(key,value){filters.push([key,value]);return this;},in(key,value){filters.push([key,value]);return this;},maybeSingle(){return this;},update(patch){this.patch=patch;return this;},then(resolve){
    const row=table==="external_publish_jobs"?job:table==="external_channel_accounts"?account:{id:"action",store_id:"store"};
    const matches=filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value);
    if(this.patch&&matches) Object.assign(row,structuredClone(this.patch));
    return Promise.resolve(resolve({data:matches?(this.patch&&this.selected?{id:row.id}:structuredClone(row)):null,error:null}));
  }};return query;}
};
const {executeSnsPublishJob,retryOwnedSnsPublishJob}=load("lib/phase5/sns-publishing.ts",{
  "@/lib/ai-usage/meter":{},"@/lib/openai/models":{},"@/lib/auth/server":{getCurrentUserAccess:async()=>({isPlatformAdmin:false,organizationRoles:{org:"org_owner"},storeRoles:{}})},"@/lib/phase6/compliance-data":{logAuditEvent:async()=>{}},"@/lib/phase5/sns-rules":{},"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},"@/lib/stores":{getStore:async id=>({id,organization_id:"org"})},
  "@/lib/instagram/policy":policy,"@/lib/instagram/secrets":secrets,"@/lib/instagram/service":{
    refreshInstagramAccount:async()=>{throw new Error("Unexpected refresh");},instagramClient:()=>({
      post:async(path,token)=>{assert.equal(token,"synthetic-instagram-token");if(path.endsWith("/media_publish")){posts++;if(failPublish)throw new Error("provider_result_unknown");return {id:"17940000000000001"};}assert(path.endsWith("/media"));return {id:"17940000000000002"};},
      get:async(path,token,fields)=>{assert.equal(token,"synthetic-instagram-token");if(fields==="permalink"){if(failPermalink)throw new Error("permalink_unavailable");return {permalink:"https://www.instagram.com/p/SYNTHETIC/"};}if(revokeDuringPreparation)authorized=false;return {status_code:"FINISHED"};}
    })
  }
});
const previousFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert(new URL(url).hostname==="graph.facebook.com");legacyCalls++;return new Response(JSON.stringify(String(url).includes("photos")?{post_id:"1328_1794"}:{permalink_url:"https://www.facebook.com/SYNTHETIC"}),{status:200});};
try {
  reset();assert.equal((await executeSnsPublishJob("job")).status,"sent");assert.equal(posts,1);assert.equal(legacyCalls,0);assert.equal(job.status,"sent");
  reset();failPermalink=true;assert.equal((await executeSnsPublishJob("job")).status,"sent");assert.equal(posts,1);assert.equal(job.status,"sent");
  reset();failPublish=true;await assert.rejects(()=>executeSnsPublishJob("job"),/二重投稿/);assert.equal(job.status,"unknown");assert.equal(job.next_retry_at,null);assert.equal(posts,1);assert.equal((await executeSnsPublishJob("job")).status,"unknown");assert.equal(posts,1,"unknown response never auto-republishes");
  reset();account.metadata.connection_generation="changed";await assert.rejects(()=>executeSnsPublishJob("job"),/接続が変更/);assert.equal(job.status,"manual_required");assert.equal(posts,0);
  reset();authorized=false;await assert.rejects(()=>executeSnsPublishJob("job"),/権限が変更/);assert.equal(posts,0);
  reset();revokeDuringPreparation=true;await assert.rejects(()=>executeSnsPublishJob("job"),/公開は開始していません/);assert.equal(posts,0);
  reset();await assert.rejects(()=>retryOwnedSnsPublishJob("other-store","action","job"),/この店舗/);assert.equal(posts,0);
  reset();await assert.rejects(()=>retryOwnedSnsPublishJob("store","other-action","job"),/この店舗/);assert.equal(posts,0);
  reset();job.status="unknown";await assert.rejects(()=>retryOwnedSnsPublishJob("store","action","job"),/再実行できません/);assert.equal(posts,0);
  reset();job.status="sending";assert.equal((await executeSnsPublishJob("job")).status,"sending");assert.equal(posts,0);
  reset("meta");delete job.payload_json.connection_provider;delete job.payload_json.connection_account_id;assert.equal((await executeSnsPublishJob("job")).status,"sent");assert.equal(legacyCalls,2,"legacy Facebook posts still use Facebook Graph API");assert.equal(posts,0);
  console.log("PASS Instagram publish execution: direct/legacy routing, permission recheck, unchanged legacy jobs, target-generation binding, publish uncertainty stops retries, successful permalink failure does not republish");
} finally {globalThis.fetch=previousFetch;for(const name of envNames){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
