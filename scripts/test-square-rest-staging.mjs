// Empty reads and permission checks only, against the existing staging project.
// Existing API credentials remain in process memory and are never printed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
assert(process.argv.includes('--staging-empty-reads'));
const ref='zlqqjifitnvorudxbepy', workdir=process.env.SQUARE_STAGING_CLI_DIR;
assert(workdir && readFileSync(`${workdir}/supabase/.temp/project-ref`,'utf8').trim()===ref);
try {
  const keys=JSON.parse(execFileSync('/opt/homebrew/bin/supabase',['projects','api-keys','--project-ref',ref,'--reveal','--output','json','--workdir',workdir],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const secret=keys.find(x=>x.name==='aio_staging_vercel'&&x.type==='secret')?.api_key;
  const publishable=keys.find(x=>x.type==='publishable')?.api_key;
  assert(secret&&publishable);
  const db=createClient(`https://${ref}.supabase.co`,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const anon=createClient(`https://${ref}.supabase.co`,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
  const filter=readFileSync('lib/pos/transaction-state.ts','utf8').match(/EFFECTIVE_POS_SALES_FILTER = "([^"]+)"/u)?.[1];
  assert(filter);
  const result=await db.from('sales_transactions').select('id',{count:'exact'}).eq('store_id',randomUUID()).or(filter).limit(1);
  assert(!result.error,'PostgREST financial-state filter must parse'); assert.equal(result.count,0);
  const allowed=await db.rpc('square_pos_owner_allowed',{p_actor:randomUUID(),p_store:randomUUID()});
  assert(!allowed.error && allowed.data===false,'New RPC must be visible in the service schema cache and reject an unknown actor');
  for(const table of ['square_pos_connections','square_pos_transaction_versions','square_pos_oauth_sessions']) {
    const response=await anon.from(table).select('id').limit(1);
    assert.equal(response.error?.code,'42501','Anonymous direct access must be refused, not just missing from schema');
  }
  const rpc=await anon.rpc('begin_square_pos_oauth',{p_actor:randomUUID(),p_store:randomUUID(),p_state:'a'.repeat(64),p_environment:'sandbox',p_redirect:'https://staging.aioboost.jp/api/square/oauth/callback'});
  assert(rpc.error,'Anonymous mutation RPC must be refused');
  console.log('PASS Square staging REST: effective-sales filter parses, random nonexistent store is empty, anonymous tables/RPC are denied. No records created.');
} catch {
  console.error('Square staging REST verification failed; provider credentials and raw responses were withheld.');
  process.exitCode=1;
}
