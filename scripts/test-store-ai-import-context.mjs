// In-memory only: no environment files, live databases, AI calls or customer data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const store={id:"00000000-0000-4000-8000-000000000001",organization_id:"00000000-0000-4000-8000-000000000010",name:"Synthetic store",industry_type_key:"other"};
const first="00000000-0000-4000-8000-000000000002", second="00000000-0000-4000-8000-000000000003", foreign="00000000-0000-4000-8000-000000000004";
const base=`/stores/${store.id}`;
let role="org_owner", inactive=false, fail=false, archivedDuringRead=false, calls=[];
const access=()=>({accountActive:!inactive,isPlatformAdmin:role==="platform_admin",organizationIds:[store.organization_id],storeIds:[store.id],organizationRoles:{[store.organization_id]:role},storeRoles:{}});
function job(id=first,extra={}) { return {id,store_id:store.id,organization_id:store.organization_id,archived_at:null,status:"review_required",total_rows:1,approved_rows:0,updated_at:"2026-10-03T00:00:00Z",original_filename:"PRIVATE_FILENAME",sheet_summaries:[{name:"PRIVATE_SHEET",sourceRange:"A1:D2",suggestedRecordType:"sale",clarification:{issues:[{id:"issue",code:"report_period",severity:"clarifiable",message:"PRIVATE_INSTRUCTION",source:{range:"A1:D2",sheetName:"PRIVATE_SHEET"},details:{year:2026,month:10}}]}}],questions:[],clarification_state:{remainingIssueIds:["issue"],heldTables:[],acceptedResolutionIds:[]},clarification_pending_id:null,...extra}; }
let jobs=[job(),job(second,{total_rows:2}),job(foreign,{store_id:"another-store",original_filename:"PRIVATE_FOREIGN"})];
let records=[];
function resetRows() { records=jobs.flatMap(j=>Array.from({length:j.total_rows},(_,i)=>({id:`${j.id}-${i}`,import_job_id:j.id,store_id:j.store_id,organization_id:j.organization_id,sheet_name:"PRIVATE_SHEET",review_status:"question",confirmed_record_type:"sale",missing_fields:["date"],raw_data:{email:"PRIVATE_CONTACT"},normalized_data:{amount:987654321}}))); }
resetRows();
const db={from(table){let fields="",filters=[],range=null,single=false;const query={
  select(value){fields=value;return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},is(key,value){filters.push(row=>(row[key]??null)===value);return query;},order(){return query;},range(a,b){range=[a,b];return query;},maybeSingle(){single=true;return query;},
  then(done,reject){try{calls.push({table,fields,range});assert(["unified_import_jobs","unified_import_rows"].includes(table));
    let data=(table==="unified_import_jobs"?jobs:records).filter(row=>filters.every(test=>test(row)));
    if(range)data=data.slice(range[0],range[1]+1);
    if(archivedDuringRead&&table==="unified_import_rows")jobs[0].archived_at="2026-10-03";
    done({data:fail?null:structuredClone(single?data[0]??null:data),error:fail?{message:"PRIVATE_DB_FAILURE"}:null});
  }catch(error){reject(error);}}
};return query;}};
const never=()=>{throw new Error("Unexpected out-of-scope read");};
const mocks={"server-only":{},"@/lib/auth/server":{getCurrentUserAccess:async()=>access()},"@/lib/supabase/admin":{createSupabaseAdminClient:()=>db},
  "@/lib/marketing/reviews":{getReviewSummary:never},"@/lib/feature-flags/resolve-feature-flags":{resolveFeatureFlags:never},
  "@/lib/bookings":{getBooking:never,listBookings:never,listCalendarBookings:never},"@/lib/bookings/constants":{bookingStatusLabels:{},bookingSourceLabels:{}},
  "@/lib/customer-workbench":{readCustomerWorkbench:never},"@/lib/customer-crm":{customerMatchesSegment:never},"@/lib/menu-workbench":{menuSales:never}};
const cache=new Map();
function source(path){path=resolve(path);if(cache.has(path))return cache.get(path);const loaded={exports:{}};cache.set(path,loaded.exports);
  const js=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function("require","module","exports",js)(specifier=>{
    if(Object.hasOwn(mocks,specifier))return mocks[specifier];
    if(specifier==="./readiness")return {getStoreAiReadiness:never};
    return source(specifier.startsWith("@/")?`${specifier.slice(2)}.ts`:resolve(dirname(path),`${specifier}.ts`));
  },loaded,loaded.exports);return loaded.exports;}
const {loadStoreAiContext}=source("lib/store-ai/context.ts");
const {publicContext}=source("lib/store-ai/context-rules.ts");
const {buildAssistantMessages}=source("lib/store-ai/prompt.ts");
const read=(id=first)=>loadStoreAiContext(store,`${base}/data-imports/ai/${id}`);

const owner=await read();assert.equal(owner.sections[0].state,"ready");assert.equal(owner.sections[0].data.jobId,first);assert.equal(owner.sections[0].data.counts.total,1);
assert(!JSON.stringify(owner).includes("PRIVATE"));assert.equal(owner.sections[0].data.nextQuestion.code,"report_period");
assert(!Object.hasOwn(publicContext(owner).sections[0],"data"));
const messages=buildAssistantMessages(owner,{message:"What needs checking?",history:[]});assert(!JSON.stringify(messages).includes("PRIVATE"));assert.match(messages[0].content,/一度に一つ/);assert.match(messages[0].content,/読み取り/);
assert(calls.every(call=>!/(?:raw_data|normalized_data|original_filename|storage_path)/u.test(call.fields)));
assert(calls.some(call=>call.fields.includes("clarification_pending_id:answers->clarification_pending->>id")));
const next=await read(second);assert.notEqual(next.key,owner.key);assert.equal(next.sections[0].data.counts.total,2);
for(const permission of ["staff","viewer"]){role=permission;calls=[];const restricted=await read();assert.equal(restricted.sections[0].state,"restricted");assert.equal(calls.length,0);assert(!JSON.stringify(restricted).includes("987654321"));}
role="platform_admin";calls=[];assert.equal((await read(foreign)).sections[0].state,"unavailable");assert(!calls.some(c=>c.table==="unified_import_rows"));
role="org_owner";jobs[0].archived_at="2026-10-03";calls=[];assert.equal((await read()).sections[0].state,"unavailable");assert(!calls.some(c=>c.table==="unified_import_rows"));jobs[0].archived_at=null;
calls=[];const list=await loadStoreAiContext(store,`${base}/data-imports/ai`,`jobId=${first}`);assert.equal(list.sections[0].state,"empty");assert.equal(calls.length,0);
await assert.rejects(()=>loadStoreAiContext(store,`/stores/${foreign}/data-imports/ai/${first}`),/invalid_page/);
inactive=true;calls=[];await assert.rejects(read,/unauthorized/);assert.equal(calls.length,0);inactive=false;
fail=true;assert.equal((await read()).sections[0].state,"unavailable");fail=false;
jobs[0].total_rows=1205;resetRows();calls=[];assert.equal((await read()).sections[0].data.counts.total,1205);assert.deepEqual(calls.filter(c=>c.table==="unified_import_rows").map(c=>c.range),[[0,499],[500,999],[1000,1499]]);
records.pop();jobs[1].total_rows+=1;assert.equal((await read(second)).sections[0].state,"unavailable");
jobs=[job()];resetRows();archivedDuringRead=true;assert.equal((await read()).sections[0].state,"unavailable");
console.log("Store AI import context: exact route/store/org/archive boundaries, financial roles, privacy allowlists, current-job switching, bounded complete counts, failures and read-only controls passed.");
// Exercise the actual context builder, not just its presentation helper.
let googleAvailable=false;
mocks["@/lib/marketing/reviews"].getReviewSummary=async()=>({connected:false,unanswered:2});
mocks["@/lib/feature-flags/resolve-feature-flags"].resolveFeatureFlags=()=>({google_integrations:googleAvailable,google_oauth_connection:googleAvailable,google_business_profile_integration:googleAvailable});
const disabled=await loadStoreAiContext(store,`${base}/marketing/reviews`);
assert(disabled.greeting.includes("利用対象外"));
assert(!disabled.links.some(link=>link.href.includes("/settings/google")));
assert(!disabled.suggestions.some(text=>text.includes("Google接続")));
googleAvailable=true;
const disconnected=await loadStoreAiContext(store,`${base}/marketing/reviews`);
assert(disconnected.greeting.includes("接続と対象店舗"));
assert(disconnected.links.some(link=>link.href===`${base}/settings/google`));
console.log("Store AI review context: disabled features never offer connection links; enabled disconnected stores retain guidance.");
