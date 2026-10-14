// Existing staging only. Synthetic users/stores/tokens; no Meta, AI, email or publication calls.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
assert(process.argv.includes("--staging-synthetic-live"));
const ref="zlqqjifitnvorudxbepy",workdir=process.env.INSTAGRAM_STAGING_CLI_DIR;
assert(workdir && readFileSync(`${workdir}/supabase/.temp/project-ref`,"utf8").trim()===ref,"Designated staging CLI required");
let keys;
try { keys=JSON.parse(execFileSync("/opt/homebrew/bin/supabase",["projects","api-keys","--project-ref",ref,"--reveal","--output","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]})); }
catch { throw new Error("Cannot read designated staging credentials"); }
const secret=keys.find(k=>k.name==="aio_staging_vercel"&&k.type==="secret")?.api_key;
const anon=keys.find(k=>k.type==="publishable")?.api_key;
assert(secret&&anon,"Staging credentials unavailable"); keys=null;
const url=`https://${ref}.supabase.co`;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const login=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=result=>{if(result.error) throw new Error(result.error.message);return result.data;};
const org=randomUUID(),store=randomUUID(),otherOrg=randomUUID(),otherStore=randomUUID(),users=[];
const redirect="https://staging.aioboost.jp/api/instagram/oauth/callback";
const state=()=>createHash("sha256").update(randomBytes(32)).digest("hex");
const start=(actor,storeId=store,hash=state(),uri=redirect)=>db.rpc("start_instagram_oauth",{p_actor:actor,p_store:storeId,p_hash:hash,p_redirect:uri});
const consume=(actor,hash,uri=redirect)=>db.rpc("consume_instagram_oauth",{p_actor:actor,p_hash:hash,p_redirect:uri});
const finish=(actor,hash,overrides={})=>db.rpc("finish_instagram_oauth",{p_actor:actor,p_hash:hash,p_external_id:"17841400000000001",p_username:"synthetic_instagram_review",p_account_type:"BUSINESS",p_cipher:"ig1:synthetic-not-a-provider-token",p_expires:new Date(Date.now()+60*86_400_000).toISOString(),...overrides});
const direct=async()=>checked(await db.from("external_channel_accounts").select("*").eq("store_id",store).eq("external_provider","instagram_login").single());
const validate=a=>db.rpc("validate_instagram_publish_connection",{p_store:store,p_account:a.id,p_generation:a.metadata.connection_generation});
let signed;
try {
  checked(await db.from("organizations").insert([{id:org,name:"INSTAGRAM SYNTHETIC",status:"active"},{id:otherOrg,name:"INSTAGRAM SYNTHETIC FOREIGN",status:"active"}]));
  checked(await db.from("stores").insert([{id:store,organization_id:org,name:"Instagram合成検証専用",industry_type_key:"restaurant",status:"active"},{id:otherStore,organization_id:otherOrg,name:"Instagram別法人合成検証専用",industry_type_key:"restaurant",status:"active"}]));
  const sessions={};
  for(const role of ["owner","manager","staff","viewer","foreign"]) {
    const email=`instagram-${randomUUID()}@example.invalid`,password=`${randomUUID()}!Aa9`;
    const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true})).user;
    users.push(user.id);
    checked(await db.from("user_profiles").upsert({user_id:user.id,display_name:`SYNTHETIC ${role}`,role:"user",status:"active"}));
    sessions[role]=checked(await login.auth.signInWithPassword({email,password})).session.access_token;
  }
  const [owner,manager,staff,viewer,foreign]=users;
  checked(await db.from("organization_members").insert([{organization_id:org,user_id:owner,role_key:"org_owner",status:"active"},{organization_id:otherOrg,user_id:foreign,role_key:"org_owner",status:"active"}]));
  checked(await db.from("store_memberships").insert([manager,staff,viewer].map((user,index)=>({organization_id:org,store_id:store,user_id:user,email:`synthetic-${index}@example.invalid`,role_key:["store_manager","staff","viewer"][index],status:"active"}))));
  assert((await start(viewer)).error,"viewer cannot connect");
  assert((await start(foreign)).error,"other organization cannot connect");
  assert((await start(owner,otherStore)).error,"owner cannot connect unrelated store");
  assert((await start(owner,store,state(),"https://example.com/callback")).error,"redirect allowlist enforced in database");
  for(const actor of [manager,staff]) checked(await start(actor));

  signed=createClient(url,anon,{auth:{persistSession:false},global:{headers:{Authorization:`Bearer ${sessions.owner}`}}});
  assert((await signed.from("instagram_oauth_attempts").select("*")).error,"browser cannot read server-only auth state");
  assert((await signed.rpc("start_instagram_oauth",{p_actor:owner,p_store:store,p_hash:state(),p_redirect:redirect})).error,"browser cannot call privileged state RPC");
  const hash=state(); checked(await start(owner,store,hash));
  assert((await consume(staff,hash)).error,"same store, different actor rejected");
  assert((await consume(owner,hash,"https://app.aioboost.jp/api/instagram/oauth/callback")).error,"different environment rejected");
  const concurrent=await Promise.all([consume(owner,hash),consume(owner,hash)]);
  assert.equal(concurrent.filter(result=>!result.error).length,1,"nonce is consumed once across concurrent instances");
  assert((await finish(owner,hash,{p_expires:null})).error,"null expiry rejected");
  const accountId=checked(await finish(owner,hash));
  let a=await direct();assert.equal(a.id,accountId);assert.equal(a.channel,"instagram");assert.equal(a.metadata.connected_by,owner);
  assert((await finish(owner,hash)).error,"completion cannot be replayed");
  assert.equal(checked(await validate(a)),true);
  assert((await signed.from("external_channel_accounts").update({connection_status:"disconnected"}).eq("id",a.id)).error,"direct browser credential mutation rejected");
  assert((await signed.from("external_channel_accounts").delete().eq("id",a.id)).error,"direct browser credential deletion rejected");

  const legacyId=randomUUID(),legacy={id:legacyId,organization_id:org,store_id:store,channel:"facebook",external_provider:"meta",external_account_id:"132800000000001",account_name:"SYNTHETIC FACEBOOK PRESERVED",connection_status:"connected",access_token_encrypted:"v1.synthetic-facebook-not-a-provider-token",metadata:{synthetic:true}};
  checked(await db.from("external_channel_accounts").insert(legacy));
  const legacyBefore=checked(await db.from("external_channel_accounts").select("*").eq("id",legacyId).single());
  const reconnect=state();checked(await start(owner,store,reconnect));checked(await consume(owner,reconnect));
  checked(await db.rpc("disconnect_instagram_login",{p_actor:manager,p_store:store}));
  assert((await finish(owner,reconnect)).error,"in-flight callback cannot undo a disconnect");
  a=await direct();assert.equal(a.access_token_encrypted,null);assert.equal(a.connection_status,"disconnected");
  assert.equal(checked(await validate(a)),false);
  assert.deepEqual(checked(await db.from("external_channel_accounts").select("*").eq("id",legacyId).single()),legacyBefore,"Facebook token and history unchanged");

  const fresh=state();checked(await start(owner,store,fresh));checked(await consume(owner,fresh));checked(await finish(owner,fresh));a=await direct();
  checked(await db.from("organization_members").update({status:"inactive"}).eq("organization_id",org).eq("user_id",owner));
  assert.equal(checked(await validate(a)),false,"removed connector stops background publication");
  checked(await db.from("organization_members").update({status:"active"}).eq("organization_id",org).eq("user_id",owner));
  checked(await db.from("external_channel_accounts").update({metadata:{...a.metadata,token_issued_at:new Date(Date.now()-2*86_400_000).toISOString()}}).eq("id",a.id));
  a=await direct();
  const refresh={p_actor:owner,p_store:store,p_account:a.id,p_old_cipher:a.access_token_encrypted,p_new_cipher:"ig1:synthetic-refreshed",p_expires:new Date(Date.now()+60*86_400_000).toISOString()};
  assert.equal(checked(await db.rpc("refresh_instagram_login",refresh)),true);
  assert.equal(checked(await db.rpc("refresh_instagram_login",refresh)),false,"stale refresh cannot overwrite current credentials");
  assert.equal((await direct()).metadata.connection_generation,a.metadata.connection_generation,"refresh preserves queued target binding");
  assert((await db.rpc("disconnect_instagram_login",{p_actor:viewer,p_store:store})).error);
  const expired=state();checked(await start(owner,store,expired));checked(await db.from("instagram_oauth_attempts").update({expires_at:new Date(Date.now()-60_000).toISOString()}).eq("state_hash",expired));
  assert((await consume(owner,expired)).error,"expired nonce rejected");
  const revoked=state();checked(await start(staff,store,revoked));checked(await consume(staff,revoked));
  checked(await db.from("store_memberships").update({status:"suspended"}).eq("store_id",store).eq("user_id",staff));
  assert((await finish(staff,revoked)).error,"permission rechecked after external token exchange");
  const beforeCount=checked(await db.from("audit_logs").select("id").eq("store_id",store)).length;
  assert(beforeCount>=4,"connection lifecycle audited without tokens");
  assert.deepEqual(checked(await db.from("external_channel_accounts").select("*").eq("id",legacyId).single()),legacyBefore);
  console.log("PASS staging Instagram OAuth: role/store/environment separation, single-use nonce, direct-RPC denial, atomic reconnect/disconnect, connector revocation, refresh CAS, expiry and unchanged Facebook");
} finally {
  // Only the synthetic IDs created above; never target a real store or a broad collection.
  for(const id of [store,otherStore]) { checked(await db.from("audit_logs").delete().eq("store_id",id));checked(await db.from("external_channel_accounts").delete().eq("store_id",id)); }
  for(const id of [org,otherOrg]) checked(await db.from("organizations").delete().eq("id",id));
  for(const id of users) checked(await db.auth.admin.deleteUser(id));
  console.log("Synthetic Instagram test stores/users removed; no external post or email sent");
}
