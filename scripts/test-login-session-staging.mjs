import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const ref='zlqqjifitnvorudxbepy',base=process.env.LOGIN_TEST_BASE_URL??'https://staging.aioboost.jp';
assert(['https://staging.aioboost.jp','http://127.0.0.1:3191'].includes(base));
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='aio_staging_vercel'&&k.type==='secret')?.api_key,anon=keys.find(k=>k.type==='publishable')?.api_key;assert(secret&&anon);
const db=createClient(`https://${ref}.supabase.co`,secret,{auth:{persistSession:false,autoRefreshToken:false}}),check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const org=randomUUID(),a=randomUUID(),b=randomUUID(),application=randomUUID(),users={},results=[];
try{
 for(const role of ['owner','staff','none','admin']){
  const email=`login-check-${role}-${randomUUID()}@example.invalid`,password=`${randomUUID()}Aa9!`;
  const u=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user;users[role]={id:u.id,email};
  check(await db.from('user_profiles').upsert({user_id:u.id,display_name:'LOGIN CHECK',role:role==='admin'?'platform_admin':'user',status:'active'}));
  const auth=createClient(`https://${ref}.supabase.co`,anon,{auth:{persistSession:false,autoRefreshToken:false}});users[role].token=check(await auth.auth.signInWithPassword({email,password})).session.access_token;
 }
 check(await db.from('organizations').insert({id:org,name:'LOGIN CHECK SYNTHETIC',status:'active'}));
 check(await db.from('stores').insert([a,b].map(id=>({id,organization_id:org,name:'LOGIN CHECK',industry_type_key:'restaurant',status:'active'}))));
 check(await db.from('organization_members').insert({organization_id:org,user_id:users.owner.id,role_key:'org_owner',status:'active'}));
 check(await db.from('store_memberships').insert({organization_id:org,store_id:a,user_id:users.staff.id,email:users.staff.email,role_key:'staff',status:'active',invitation_status:'accepted'}));
 check(await db.from('applications').insert({id:application,store_name:'LOGIN CHECK',contact_name:'SYNTHETIC',email:users.owner.email,store_count:1,pain_points:'audit',status:'account_issued',approval_status:'approved',payment_status:'paid',account_status:'issued',invitation_status:'password_set',onboarding_status:'completed',invited_user_id:users.owner.id,store_id:a,organization_id:org}));
 for(const role of Object.keys(users)){
  const start=Date.now();const r=await fetch(`${base}/api/auth/session`,{method:'POST',headers:{'content-type':'application/json',cookie:`aio_last_store_id=${role==='staff'?b:a}`},body:JSON.stringify({access_token:users[role].token,expires_in:3600})});
  const body=await r.json();const expected=role==='admin'?'/admin':role==='none'?'/no-store':`/stores/${a}`;
  results.push({role,status:r.status,ms:Date.now()-start,correctDestination:body.next_path===expected,pathKind:body.next_path?.replace(a,'STORE_A').replace(b,'STORE_B')});
 }
 const state=check(await db.from('applications').select('onboarding_status').eq('id',application).single());results.push({test:'completed-onboarding-preserved',pass:state.onboarding_status==='completed',actual:state.onboarding_status});
 console.log(JSON.stringify(results,null,2));await writeFile(`/private/tmp/aiob-login-${process.env.LOGIN_TEST_LABEL??'baseline'}.json`,JSON.stringify(results,null,2));
 if(process.env.LOGIN_EXPECT_FIXED==='1'){assert(results.slice(0,4).every(r=>r.status===200&&r.correctDestination));assert.equal(state.onboarding_status,'completed');}
}finally{
 check(await db.from('applications').delete().eq('id',application));check(await db.from('organizations').delete().eq('id',org));for(const u of Object.values(users))check(await db.auth.admin.deleteUser(u.id));console.log('Login fixtures removed.');
}
