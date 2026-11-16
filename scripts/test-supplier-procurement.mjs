// Runs the real migration in a disposable local PostgreSQL cluster, over a private Unix socket.
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const prefix=`${process.platform==='darwin'?'/private/tmp':tmpdir()}/aiob-procurement-pg-`;
const dir=mkdtempSync(prefix), data=`${dir}/data`, socket=`${dir}/socket`;
let started=false;
function run(command,args,input) {
  const r=spawnSync(command,args,{input,encoding:'utf8',maxBuffer:2_000_000});
  if(r.status!==0) throw new Error(`${command}: ${r.stderr||r.stdout||r.error}`);
  return r.stdout;
}
try {
  mkdirSync(socket);
  run('initdb',['-D',data,'--username=aiob_fixture','--auth=trust','--encoding=UTF8','--no-locale']);
  run('pg_ctl',['-D',data,'-l',`${dir}/postgres.log`,'-o',`-h '' -k ${socket} -p 55474`,'-w','start']);
  started=true;
  const menu=readFileSync('supabase/migrations/202609240001_menu_workbench.sql','utf8');
  const auth=menu.slice(menu.indexOf('create or replace function public.menu_actor_allowed'),menu.indexOf('create or replace function public.set_menu_availability'));
  assert(auth.includes('p_manager'));
  const migration=readFileSync('supabase/migrations/202611160001_supplier_procurement.sql','utf8');
  const sql=String.raw`
create role service_role; create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key,banned_until timestamptz);
create table public.user_profiles(user_id uuid,role text,status text default 'active',archived_at timestamptz);
create table public.organizations(id uuid primary key,name text not null,status text default 'active',archived_at timestamptz);
create table public.stores(id uuid primary key,organization_id uuid,status text default 'active',archived_at timestamptz);
create table public.organization_members(user_id uuid,organization_id uuid,role_key text,status text default 'active',archived_at timestamptz);
create table public.store_memberships(user_id uuid,store_id uuid,organization_id uuid,role_key text,status text default 'active',archived_at timestamptz);
${auth}
${migration}
create function pg_temp.reject(stmt text, expected text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlerrm = expected then return; end if;
    raise exception 'Expected %, got %',expected,sqlerrm;
  end;
  raise exception 'Expected %, operation unexpectedly succeeded',expected;
end $$;
do $$
declare
  org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); st uuid:=gen_random_uuid(); other_st uuid:=gen_random_uuid();
  owner_id uuid:=gen_random_uuid(); admin_id uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid(); person uuid;
  sup uuid; other_sup uuid; foreign_sup uuid; ord uuid:=gen_random_uuid(); cancelled uuid:=gen_random_uuid(); foreign_ord uuid:=gen_random_uuid();
  signup text:=repeat('a',64); session1 text:=repeat('b',64); session2 text:=repeat('c',64); bad text:=repeat('d',64);
  supplier_data jsonb:='{"name":"食材商店","email":"food@example.test","registration_number":"T1234567890123"}';
  other_data jsonb:='{"name":"資材商店","email":"pack@example.test"}';
  items jsonb:='[{"name":"食材 A","unit":"袋","quantity":1,"unit_price":112,"tax_rate":8},{"name":"食材 B","unit":"袋","quantity":1,"unit_price":112,"tax_rate":8},{"name":"運搬","unit":"件","quantity":2,"unit_price":150,"tax_rate":10}]';
  today date:=(now() at time zone 'Asia/Tokyo')::date; snap jsonb; v jsonb;
begin
  insert into organizations(id,name) values(org,'テスト発注者'),(other_org,'別法人');
  insert into stores(id,organization_id) values(st,org),(other_st,other_org);
  foreach person in array array[owner_id,admin_id,employee] loop
    insert into auth.users values(person,null);
    insert into user_profiles(user_id,role) values(person,case when person=admin_id then 'platform_admin' else 'user' end);
  end loop;
  insert into organization_members(user_id,organization_id,role_key) values(owner_id,org,'org_owner');
  insert into store_memberships(user_id,store_id,organization_id,role_key) values(employee,st,org,'staff');
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,null,%L)',owner_id,st,'create',supplier_data),'procurement_cap');
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,null,%L)',owner_id,st,'limit','{"limit":1}'),'procurement_forbidden');
  perform procurement_buyer_supplier(admin_id,st,'limit',null,'{"limit":1}');
  perform procurement_buyer_supplier(admin_id,other_st,'limit',null,'{"limit":1}');
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,null,%L)',employee,st,'create',supplier_data),'procurement_forbidden');
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,null,%L)',owner_id,other_st,'create',supplier_data),'procurement_forbidden');
  sup:=procurement_buyer_supplier(owner_id,st,'create',null,supplier_data);
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,null,%L)',owner_id,st,'create',other_data),'procurement_cap');
  perform procurement_buyer_supplier(admin_id,st,'limit',null,'{"limit":2}');
  other_sup:=procurement_buyer_supplier(owner_id,st,'create',null,other_data);
  foreign_sup:=procurement_buyer_supplier(admin_id,other_st,'create',null,other_data);
  assert procurement_supplier_link(sup,null,null,'unknown@example.test',signup) is null;
  assert procurement_supplier_link(sup,st,owner_id,null,signup)='food@example.test';
  assert procurement_supplier_link(sup,st,owner_id,null,bad) is null;
  assert not procurement_supplier_session(other_sup,signup,session1,'login');
  assert not procurement_supplier_session(sup,bad,session1,'login');
  assert procurement_supplier_session(sup,signup,session1,'login');
  assert not procurement_supplier_session(sup,signup,session1,'login');
  assert procurement_supplier_link(other_sup,null,null,'pack@example.test',signup)='pack@example.test';
  assert procurement_supplier_link(other_sup,null,null,'pack@example.test',bad) is null;
  assert procurement_supplier_session(other_sup,signup,session2,'login');
  assert not procurement_supplier_access(sup,session2);
  assert procurement_supplier_view(sup,bad,ord,0,false) is null;
  perform pg_temp.reject(format('select procurement_buyer_draft(%L,%L,%L,%L,0,%L,null,null)',owner_id,st,ord,foreign_sup,items),'procurement_missing');
  perform pg_temp.reject(format('select procurement_buyer_draft(%L,%L,%L,%L,0,%L,null,null)',owner_id,st,ord,sup,'[{"name":"x","unit":"kg","quantity":-1}]'),'procurement_invalid');
  perform procurement_buyer_draft(owner_id,st,ord,sup,0,items,'初回発注',today);
  perform procurement_buyer_draft(owner_id,st,ord,sup,1,items,'変更済み',today);
  perform procurement_buyer_draft(owner_id,st,cancelled,sup,0,items,null,null);
  perform procurement_move(owner_id,st,null,null,cancelled,1,'cancel',null);
  perform procurement_buyer_draft(admin_id,other_st,foreign_ord,foreign_sup,0,items,null,null);
  perform procurement_move(admin_id,other_st,null,null,foreign_ord,1,'send',null);
  assert procurement_supplier_view(sup,session1,ord,0,false)->'order'='null'::jsonb;
  assert procurement_supplier_view(sup,session1,cancelled,0,false)->'order'='null'::jsonb;
  assert procurement_supplier_view(sup,session1,foreign_ord,0,false)->'order'='null'::jsonb;
  perform procurement_move(owner_id,st,null,null,ord,2,'send',null);
  perform pg_temp.reject(format('select procurement_move(%L,%L,null,null,%L,2,%L,null)',owner_id,st,ord,'send'),'procurement_conflict');
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,%L,%L)',owner_id,st,'archive',sup,'{}'),'procurement_open_orders');
  assert procurement_supplier_view(other_sup,session2,ord,0,false)->'order'='null'::jsonb;
  assert procurement_supplier_view(sup,session1,null,0,false)->>'count'='1';
  v:=procurement_supplier_view(sup,session1,ord,0,false);
  assert v->'order'->>'note'='変更済み' and not (v->'supplier' ? 'email') and jsonb_array_length(v->'events')=1;
  perform pg_temp.reject(format('select procurement_move(%L,%L,null,null,%L,3,%L,null)',owner_id,st,ord,'accept'),'procurement_forbidden');
  perform pg_temp.reject(format('select procurement_move(null,null,%L,%L,%L,3,%L,null)',sup,session1,ord,'pay'),'procurement_forbidden');
  perform procurement_move(null,null,sup,session1,ord,3,'accept','受注しました');
  perform procurement_move(null,null,sup,session1,ord,4,'ship','納品しました');
  perform procurement_move(owner_id,st,null,null,ord,5,'receive',today::text);
  perform procurement_move(null,null,sup,session1,ord,6,'invoice','INV-1');
  snap:=(select snapshot from procurement_invoices where order_id=ord);
  assert snap->>'total'='571' and snap->'tax_summary'->0->>'tax'='17' and snap->'tax_summary'->1->>'tax'='30';
  assert snap->>'registration_number'='T1234567890123' and snap->>'buyer'='テスト発注者';
  perform procurement_buyer_supplier(owner_id,st,'edit',sup,supplier_data||'{"name":"変更後の商店"}');
  assert (select snapshot from procurement_invoices where order_id=ord)=snap;
  perform procurement_move(null,null,sup,session1,ord,7,'void_invoice','番号訂正');
  perform procurement_move(null,null,sup,session1,ord,8,'invoice','INV-2');
  assert (select count(*) from procurement_invoices where order_id=ord)=2;
  assert (select count(*) from procurement_invoices where order_id=ord and voided_at is null)=1;
  perform procurement_move(owner_id,st,null,null,ord,9,'pay',null);
  perform procurement_move(owner_id,st,null,null,ord,10,'archive',null);
  assert procurement_supplier_view(sup,session1,null,0,false)->>'count'='0';
  assert procurement_supplier_view(sup,session1,null,0,true)->>'count'='1';
  perform procurement_move(owner_id,st,null,null,ord,11,'restore',null);
  assert (select count(*) from procurement_events where order_id=ord)=12;
  perform procurement_buyer_supplier(owner_id,st,'archive',sup,'{}');
  assert not procurement_supplier_access(sup,session1);
  assert (select count(*) from procurement_invoices where order_id=ord)=2;
  perform procurement_buyer_supplier(admin_id,st,'limit',null,'{"limit":1}');
  perform pg_temp.reject(format('select procurement_buyer_supplier(%L,%L,%L,%L,%L)',owner_id,st,'restore',sup,'{}'),'procurement_cap');
  assert procurement_supplier_session(other_sup,null,session2,'logout');
  assert not procurement_supplier_access(other_sup,session2);
  update stores set archived_at=now() where id=other_st;
  assert procurement_supplier_link(foreign_sup,null,null,'pack@example.test',signup) is null;
  assert not has_table_privilege('anon','procurement_orders','SELECT');
  assert not has_table_privilege('authenticated','procurement_invoices','SELECT');
  assert not has_table_privilege('service_role','procurement_invoices','UPDATE');
  assert not has_column_privilege('service_role','procurement_suppliers','session_hash','SELECT');
  assert not has_function_privilege('authenticated','procurement_supplier_view(uuid,text,uuid,integer,boolean)','EXECUTE');
  assert has_function_privilege('service_role','procurement_supplier_view(uuid,text,uuid,integer,boolean)','EXECUTE');
end $$;
select 'PASS: account limits, invitations and session revocation, store and supplier isolation, purchasing workflow, tax totals, immutable invoices and archive history';
`;
  console.log(run('psql',['-X','-q','-v','ON_ERROR_STOP=1','-h',socket,'-p','55474','-U','aiob_fixture','-d','postgres','-f','-'],sql));
} finally {
  if(started) run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
  assert(dir.startsWith(prefix));
  rmSync(dir,{recursive:true,force:true});
}
