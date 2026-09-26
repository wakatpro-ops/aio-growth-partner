import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const ref='zlqqjifitnvorudxbepy';
const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='aio_staging_vercel'&&k.type==='secret')?.api_key,anon=keys.find(k=>k.type==='publishable')?.api_key;assert(secret&&anon);
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:secret,LOGIN_TEST_BASE_URL:'http://127.0.0.1:3191',LOGIN_TEST_LABEL:'local-fixed',LOGIN_EXPECT_FIXED:'1'};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3191'],{env,stdio:['ignore','pipe','pipe']});
// Do not persist environment values or authentication response bodies.
server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env,stdio:'inherit'});child.on('exit',code=>code===0?resolve():reject(new Error(`Test exited ${code}`)));});
try{
 let ready=false;
 for(let i=0;i<90;i++){try{if((await fetch(`${env.LOGIN_TEST_BASE_URL}/login`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
 assert(ready,'local test server ready');
 await run(['node_modules/@playwright/test/cli.js','test','--config=playwright.login.config.ts']);
 await run(['scripts/test-login-session-staging.mjs']);
}finally{server.kill('SIGTERM');}
