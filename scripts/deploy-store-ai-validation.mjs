// Ephemeral preview in the existing app project: reuses protected AI settings in-place.
// Overrides database to staging. No production domain promotion or persisted key copies.
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";
const ref="zlqqjifitnvorudxbepy";
let keys;
try { keys=JSON.parse(execFileSync("/opt/homebrew/bin/supabase",["projects","api-keys","--project-ref",ref,"--reveal","--output","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]})); }
catch { console.error("Could not load the existing staging connection. CLI output is withheld to protect credentials."); process.exit(1); }
const secret=keys.find(k=>k.name==="aio_staging_vercel"&&k.type==="secret")?.api_key, anon=keys.find(k=>k.type==="publishable")?.api_key;
assert(secret&&anon);
const isolated={NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:secret,APP_BASE_URL:"https://staging.aioboost.jp",NEXT_PUBLIC_APP_URL:"https://staging.aioboost.jp",
  SENDGRID_API_KEY:"",STRIPE_SECRET_KEY:"",GOOGLE_CLIENT_SECRET:"",META_APP_SECRET:"",LINE_CHANNEL_ACCESS_TOKEN:"",FREEE_CLIENT_SECRET:"",CRON_SECRET:"",INBOUND_EMAIL_WEBHOOK_SECRET:""};
const args=["deploy","--target","preview","--yes","--project","prj_b7InveOcjuUuMhxEWllhRtU7eT3M","--scope","wakatpro-3797s-projects"];
for(const key of Object.keys(isolated))args.push("--env",key,"--build-env",key);
const child=spawn("vercel",args,{env:{...process.env,...isolated,VERCEL_PROJECT_ID:"prj_b7InveOcjuUuMhxEWllhRtU7eT3M",VERCEL_ORG_ID:"team_wlpBR7pDkaVGzgmdp9CUO9BI"},stdio:"inherit"});
child.on("exit",code=>{process.exitCode=code??1;});
