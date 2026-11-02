import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

assert(process.argv.includes('--staging-rollback-only'), 'Explicit staging rollback flag required');
const workdir = process.env.AIRREGI_STAGING_CLI_DIR;
assert(workdir && readFileSync(resolve(workdir,'supabase/.temp/project-ref'),'utf8').trim()==='zlqqjifitnvorudxbepy', 'Only designated existing staging allowed');
const migration=readFileSync(new URL('../supabase/migrations/202611020001_airregi_partial_financial_details.sql',import.meta.url),'utf8');
assert(/^begin;$/m.test(migration) && /^commit;\s*$/m.test(migration));
const tests=readFileSync(new URL('./test-airregi-financial-staging.sql',import.meta.url),'utf8');
assert(!/\b(?:commit|rollback)\s*;/i.test(tests), 'Test file may not commit or end its transaction');
const query='begin;\n'+(process.argv.includes('--existing-schema')?'':migration.replace(/^begin;$/m,'').replace(/^commit;\s*$/m,''))+'\n'+tests+'\nrollback;';
// No credentials in source, arguments, files or output. A failed assertion also
// aborts the one transaction, including DDL. No provider or real-store access.
try {
  const output=execFileSync('/opt/homebrew/bin/supabase',['db','query','--linked',query,'--workdir',workdir,'--output','json'],
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
  console.log(output);
} catch(error) {
  process.stderr.write(String(error.stderr || 'Staging rollback test failed').slice(-2500));
  process.exitCode=1;
}
