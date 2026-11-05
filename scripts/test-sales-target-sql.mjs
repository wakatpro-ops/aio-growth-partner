// Creates an isolated, disposable local PostgreSQL database. No environment
// files, provider connections or existing databases are read or modified.
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
const temporaryRoot = process.platform === "darwin" ? "/private/tmp" : tmpdir();
const prefix = `${temporaryRoot}/aiob-sales-target-pg-`;
const root = mkdtempSync(prefix);
const data = `${root}/data`, socket = `${root}/socket`;
mkdirSync(socket);
function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: "utf8", maxBuffer: 5_000_000 });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr || result.stdout || result.error}`);
  return result.stdout;
}
let started = false;
try {
  run("initdb", ["-D", data, "--username=aiob_fixture", "--auth=trust", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl", ["-D", data, "-l", `${root}/postgres.log`, "-o", `-h '' -k ${socket} -p 55473`, "-w", "start"]); started = true;
  const menu = readFileSync("supabase/migrations/202609240001_menu_workbench.sql", "utf8");
  const actualPermissions = menu.slice(menu.indexOf("create or replace function public.menu_actor_allowed"), menu.indexOf("create or replace function public.set_menu_availability"));
  assert(actualPermissions.includes("p_manager"));
  const sql = `
create role service_role; create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key,banned_until timestamptz);
create table public.user_profiles(user_id uuid,role text,status text default 'active',archived_at timestamptz);
create table public.organizations(id uuid primary key,status text default 'active',archived_at timestamptz);
create table public.stores(id uuid primary key,organization_id uuid,status text default 'active',archived_at timestamptz,profile_data jsonb default '{}',updated_at timestamptz default now());
create table public.organization_members(user_id uuid,organization_id uuid,role_key text,status text default 'active',archived_at timestamptz);
create table public.store_memberships(user_id uuid,store_id uuid,organization_id uuid,role_key text,status text default 'active',archived_at timestamptz);
create table public.audit_logs(organization_id uuid,store_id uuid,actor_user_id uuid,action_type text,target_type text,target_id uuid,message text,metadata jsonb);
${actualPermissions}
${readFileSync("supabase/migrations/202611050001_sales_month_target.sql", "utf8")}
do $$
declare
  o uuid := '10000000-0000-4000-8000-000000000001'; s uuid := '20000000-0000-4000-8000-000000000001';
  other_org uuid := '10000000-0000-4000-8000-000000000002'; other_store uuid := '20000000-0000-4000-8000-000000000002';
  owner_id uuid := '30000000-0000-4000-8000-000000000001'; manager_id uuid := '30000000-0000-4000-8000-000000000002';
  staff_id uuid := '30000000-0000-4000-8000-000000000003'; viewer_id uuid := '30000000-0000-4000-8000-000000000004';
  admin_id uuid := '30000000-0000-4000-8000-000000000005'; a uuid; m text := to_char(now() at time zone 'Asia/Tokyo','YYYY-MM');
  rejected boolean; v jsonb; n integer;
begin
  insert into organizations(id) values(o),(other_org);
  insert into stores(id,organization_id,profile_data) values(s,o,'{"unrelated":{"keep":true},"sales_month_targets":{"2020-01":12345}}'),(other_store,other_org,'{}');
  foreach a in array array[owner_id,manager_id,staff_id,viewer_id,admin_id] loop
    insert into auth.users(id) values(a);
    insert into user_profiles(user_id,role) values(a,case when a=admin_id then 'platform_admin' else 'user' end);
  end loop;
  insert into organization_members(user_id,organization_id,role_key) values(owner_id,o,'org_owner'),(staff_id,o,'staff'),(viewer_id,o,'viewer');
  insert into store_memberships(user_id,store_id,organization_id,role_key) values(manager_id,s,o,'store_manager');
  perform save_sales_month_target(owner_id,s,m,100000);
  perform save_sales_month_target(manager_id,s,m,200000);
  perform save_sales_month_target(admin_id,s,m,300000);
  select profile_data into v from stores where id=s;
  if v->'unrelated' <> '{"keep":true}' or v->'sales_month_targets'->'2020-01' <> '12345' or v->'sales_month_targets'->m <> '300000' then raise exception 'profile preservation failed'; end if;
  select count(*) into n from audit_logs;
  if n<>3 then raise exception 'audit missing'; end if;
  perform save_sales_month_target(owner_id,s,m,300000);
  if (select count(*) from audit_logs)<>n then raise exception 'idempotent audit failed'; end if;
  foreach a in array array[staff_id,viewer_id] loop
    rejected:=false;
    begin perform save_sales_month_target(a,s,m,123); exception when others then rejected:=true; end;
    if not rejected then raise exception 'unauthorized write'; end if;
  end loop;
  rejected:=false;
  begin perform save_sales_month_target(owner_id,other_store,m,123); exception when others then rejected:=true; end;
  if not rejected then raise exception 'cross-tenant write'; end if;
  update auth.users set banned_until=now()+interval '1 day' where id=owner_id;
  rejected:=false;
  begin perform save_sales_month_target(owner_id,s,m,123); exception when others then rejected:=true; end;
  if not rejected then raise exception 'banned actor write'; end if;
  update auth.users set banned_until=null where id=owner_id;
  rejected:=false;
  begin perform save_sales_month_target(owner_id,s,m,0); exception when others then rejected:=true; end;
  if not rejected then raise exception 'zero target accepted'; end if;
  rejected:=false;
  begin perform save_sales_month_target(owner_id,s,'2000-01',123); exception when others then rejected:=true; end;
  if not rejected then raise exception 'wrong month accepted'; end if;
  perform save_sales_month_target(owner_id,s,m,null);
  if (select profile_data->'sales_month_targets' ? m from stores where id=s) then raise exception 'clear failed'; end if;
  if not exists(select 1 from audit_logs where metadata->>'before'='300000' and metadata->'after'='null'::jsonb) then raise exception 'clear history missing'; end if;
  perform save_sales_month_target(owner_id,s,m,500000);
  alter table audit_logs add constraint test_atomic check(action_type<>'sales_month_target_updated') not valid;
  rejected:=false;
  begin perform save_sales_month_target(owner_id,s,m,600000); exception when others then rejected:=true; end;
  if not rejected or (select profile_data->'sales_month_targets'->m from stores where id=s)<>'500000'::jsonb then raise exception 'audit rollback failed'; end if;
  if has_function_privilege('authenticated','public.save_sales_month_target(uuid,uuid,text,bigint)','EXECUTE') or has_function_privilege('anon','public.save_sales_month_target(uuid,uuid,text,bigint)','EXECUTE') then raise exception 'public privilege leak'; end if;
  if not has_function_privilege('service_role','public.save_sales_month_target(uuid,uuid,text,bigint)','EXECUTE') then raise exception 'service privilege missing'; end if;
end $$;
select 'PASS local SQL: actual manager authorization, tenants/bans, target update/clear/no-op, profile preservation, retained audit, atomic rollback, service-only grants';
`;
  console.log(run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55473", "-U", "aiob_fixture", "-d", "postgres", "-f", "-"], sql));
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  assert(root.startsWith(prefix));
  rmSync(root,{recursive:true,force:true});
}
