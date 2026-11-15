-- Buyer/supplier procurement. Never reuse the store's customer sales invoices.
begin;
create table public.procurement_contracts (
  store_id uuid primary key references public.stores(id), account_limit integer not null check (account_limit between 1 and 1000)
);
create table public.procurement_suppliers (
  id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
  name text not null check (char_length(name) between 1 and 160), email text not null check (char_length(email) between 3 and 254),
  registration_number text check (registration_number ~ '^T[0-9]{13}$'),
  archived_at timestamptz, created_at timestamptz not null default now(), last_login_at timestamptz,
  code_hash text, code_until timestamptz, last_link_at timestamptz,
  session_hash text, session_until timestamptz,
  unique(store_id,email), unique(store_id,id)
);
create table public.procurement_orders (
  id uuid primary key, store_id uuid not null, supplier_id uuid not null,
  foreign key(store_id,supplier_id) references public.procurement_suppliers(store_id,id),
  unique(id,store_id,supplier_id),
  status text not null default 'draft' check(status in ('draft','sent','accepted','shipped','received','invoiced','paid','declined','cancelled')),
  lines jsonb not null, note text not null default '', supplier_note text not null default '', desired_date date, received_date date,
  buyer_name text not null default '', supplier_name text not null default '',
  revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create index procurement_orders_buyer_idx on public.procurement_orders(store_id,archived_at,updated_at desc);
create index procurement_orders_supplier_idx on public.procurement_orders(supplier_id,updated_at desc);
create table public.procurement_invoices (
  id uuid primary key default gen_random_uuid(), order_id uuid not null, store_id uuid not null, supplier_id uuid not null,
  foreign key(order_id,store_id,supplier_id) references public.procurement_orders(id,store_id,supplier_id),
  document_number text not null, snapshot jsonb not null, issued_at timestamptz not null default now(),
  voided_at timestamptz, void_reason text, unique(supplier_id,document_number)
);
create unique index procurement_one_current_invoice on public.procurement_invoices(order_id) where voided_at is null;
create table public.procurement_events (
  id bigint generated always as identity primary key, store_id uuid not null references public.stores(id),
  supplier_id uuid references public.procurement_suppliers(id), order_id uuid references public.procurement_orders(id),
  buyer_actor uuid, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index procurement_events_order_idx on public.procurement_events(order_id,id);
alter table public.procurement_contracts enable row level security;
alter table public.procurement_suppliers enable row level security;
alter table public.procurement_orders enable row level security;
alter table public.procurement_invoices enable row level security;
alter table public.procurement_events enable row level security;
revoke all on public.procurement_contracts,public.procurement_suppliers,public.procurement_orders,public.procurement_invoices,public.procurement_events from public,anon,authenticated,service_role;
grant select on public.procurement_contracts,public.procurement_orders,public.procurement_invoices,public.procurement_events to service_role;
grant select(id,store_id,name,email,registration_number,archived_at,created_at,last_login_at,last_link_at) on public.procurement_suppliers to service_role;

create function public.procurement_buyer_supplier(p_actor uuid,p_store uuid,p_op text,p_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.procurement_suppliers; cap integer; new_email text; new_name text; reg text;
begin
 if not public.menu_actor_allowed(p_actor,p_store,true) then raise exception 'procurement_forbidden'; end if;
 perform 1 from public.stores where id=p_store for update;
 select account_limit into cap from public.procurement_contracts where store_id=p_store;
 if p_op='limit' then
   if not exists(select 1 from public.user_profiles where user_id=p_actor and role='platform_admin') then raise exception 'procurement_forbidden'; end if;
   if (p_data->>'limit')::integer not between 1 and 1000 or (p_data->>'limit')::integer < (select count(*) from public.procurement_suppliers where store_id=p_store and archived_at is null) then raise exception 'procurement_cap'; end if;
   insert into public.procurement_contracts values(p_store,(p_data->>'limit')::integer) on conflict(store_id) do update set account_limit=excluded.account_limit;
   insert into public.procurement_events(store_id,buyer_actor,action,detail) values(p_store,p_actor,'limit',jsonb_build_object('previous',cap,'limit',(p_data->>'limit')::integer));
   return p_store;
 end if;
 if cap is null then raise exception 'procurement_cap'; end if;
 if p_op in ('create','restore') and (select count(*) from public.procurement_suppliers where store_id=p_store and archived_at is null)>=cap then raise exception 'procurement_cap'; end if;
 if p_op in ('create','edit') then
   new_name:=trim(p_data->>'name'); new_email:=lower(trim(p_data->>'email')); reg:=nullif(upper(trim(p_data->>'registration_number')),'');
   if coalesce(char_length(new_name),0) not between 1 and 160 or coalesce(char_length(new_email),0) not between 3 and 254 or new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or (reg is not null and reg !~ '^T[0-9]{13}$') then raise exception 'procurement_invalid'; end if;
 end if;
 if p_op='create' then
   insert into public.procurement_suppliers(store_id,name,email,registration_number) values(p_store,new_name,new_email,reg) returning id into p_id;
 else
   select * into s from public.procurement_suppliers where id=p_id and store_id=p_store for update;
   if not found then raise exception 'procurement_missing'; end if;
   if p_op='restore' and s.archived_at is not null then
     update public.procurement_suppliers set archived_at=null where id=s.id;
   elsif p_op='archive' and s.archived_at is null then
     if exists(select 1 from public.procurement_orders where supplier_id=s.id and status in ('sent','accepted','shipped','received','invoiced')) then raise exception 'procurement_open_orders'; end if;
     update public.procurement_suppliers set archived_at=now(),code_hash=null,code_until=null,session_hash=null,session_until=null,last_link_at=null where id=s.id;
   elsif p_op='edit' and s.archived_at is null and new_email=s.email then
     update public.procurement_suppliers set name=new_name,registration_number=reg where id=s.id;
   else raise exception 'procurement_conflict'; end if;
 end if;
 insert into public.procurement_events(store_id,supplier_id,buyer_actor,action) values(p_store,p_id,p_actor,'supplier_'||p_op);
 return p_id;
end $$;

-- Link issuance is restricted to the assigned buyer or a matching supplier login request.
-- Only the destination already registered by the store is ever returned to the sender.
create function public.procurement_supplier_link(p_id uuid,p_store uuid,p_actor uuid,p_email text,p_hash text)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.procurement_suppliers;
begin
 select a.* into s from public.procurement_suppliers a join public.stores b on b.id=a.store_id join public.organizations o on o.id=b.organization_id
 where a.id=p_id and a.archived_at is null and b.archived_at is null and b.status='active' and o.archived_at is null and o.status='active' for update of a;
 if not found then return null; end if;
 if p_actor is null then
   if lower(trim(p_email)) is distinct from s.email or s.last_link_at>now()-interval '5 minutes' then return null; end if;
 elsif p_store is distinct from s.store_id or not public.menu_actor_allowed(p_actor,p_store,true) then raise exception 'procurement_forbidden';
 elsif s.last_link_at>now()-interval '1 minute' then return null;
 end if;
 if coalesce(p_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'procurement_invalid'; end if;
 update public.procurement_suppliers set code_hash=p_hash,code_until=now()+interval '30 minutes',last_link_at=now() where id=s.id;
 if p_actor is not null then insert into public.procurement_events(store_id,supplier_id,buyer_actor,action) values(s.store_id,s.id,p_actor,'supplier_link_requested'); end if;
 return s.email;
end $$;

create function public.procurement_supplier_session(p_id uuid,p_code text,p_session text,p_op text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if coalesce(p_session,'') !~ '^[a-f0-9]{64}$' then return false; end if;
 if p_op='login' then
   update public.procurement_suppliers a set code_hash=null,code_until=null,session_hash=p_session,session_until=now()+interval '8 hours',last_login_at=now()
   from public.stores b join public.organizations o on o.id=b.organization_id
   where a.id=p_id and a.store_id=b.id and a.code_hash=p_code and a.code_until>now() and a.archived_at is null
     and b.status='active' and b.archived_at is null and o.status='active' and o.archived_at is null;
   return found;
 elsif p_op='logout' then
   update public.procurement_suppliers set session_hash=null,session_until=null where id=p_id and session_hash=p_session;
   return found;
 end if;
 return false;
end $$;

create function public.procurement_supplier_access(p_id uuid,p_hash text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.procurement_suppliers a join public.stores b on b.id=a.store_id join public.organizations o on o.id=b.organization_id
 where a.id=p_id and a.session_hash=p_hash and a.session_until>now() and a.archived_at is null and b.status='active' and b.archived_at is null and o.status='active' and o.archived_at is null)
$$;

create function public.procurement_buyer_draft(p_actor uuid,p_store uuid,p_id uuid,p_supplier uuid,p_revision integer,p_lines jsonb,p_note text,p_date date)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.procurement_orders; l jsonb;
begin
 if not public.menu_actor_allowed(p_actor,p_store,true) then raise exception 'procurement_forbidden'; end if;
 perform 1 from public.procurement_suppliers where id=p_supplier and store_id=p_store and archived_at is null for update;
 if not found then raise exception 'procurement_missing'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 50 or coalesce(char_length(p_note),0)>1000 then raise exception 'procurement_invalid'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
   if jsonb_typeof(l)<>'object' or coalesce(char_length(trim(l->>'name')),0) not between 1 and 120 or coalesce(char_length(trim(l->>'unit')),0) not between 1 and 20
     or coalesce(l->>'quantity','') !~ '^[0-9]{1,5}$' or (l->>'quantity')::integer<1
     or coalesce(l->>'unit_price','') !~ '^[0-9]{1,8}$' or coalesce(l->>'tax_rate','') not in ('8','10') then raise exception 'procurement_invalid'; end if;
 end loop;
 select * into o from public.procurement_orders where id=p_id and store_id=p_store for update;
 if not found and p_revision=0 then
   insert into public.procurement_orders(id,store_id,supplier_id,lines,note,desired_date) values(p_id,p_store,p_supplier,p_lines,coalesce(p_note,''),p_date);
 elsif o.supplier_id=p_supplier and o.status='draft' and o.archived_at is null and o.revision=p_revision then
   update public.procurement_orders set lines=p_lines,note=coalesce(p_note,''),desired_date=p_date,revision=revision+1,updated_at=now() where id=p_id and store_id=p_store;
 else raise exception 'procurement_conflict'; end if;
 insert into public.procurement_events(store_id,supplier_id,order_id,buyer_actor,action) values(p_store,p_supplier,p_id,p_actor,'draft');
 return p_id;
end $$;

create function public.procurement_move(p_actor uuid,p_store uuid,p_supplier uuid,p_hash text,p_id uuid,p_revision integer,p_op text,p_value text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.procurement_orders; s public.procurement_suppliers; next_state text; tax_summary jsonb; total bigint;
  invoice_no text; purchase_name text; event_detail jsonb:='{}'; apply_archive boolean:=false; apply_restore boolean:=false; delivery date;
begin
 if p_actor is not null then
   if not public.menu_actor_allowed(p_actor,p_store,true) then raise exception 'procurement_forbidden'; end if;
   select supplier_id into p_supplier from public.procurement_orders where id=p_id and store_id=p_store;
 end if;
 select * into s from public.procurement_suppliers where id=p_supplier for update;
 if not found then raise exception 'procurement_missing'; end if;
 if p_actor is null and not public.procurement_supplier_access(s.id,p_hash) then raise exception 'procurement_forbidden'; end if;
 select * into o from public.procurement_orders where id=p_id and supplier_id=s.id and store_id=s.store_id for update;
 if not found or (p_actor is not null and o.store_id is distinct from p_store) then raise exception 'procurement_missing'; end if;
 if o.revision is distinct from p_revision or (o.archived_at is not null and p_op<>'restore') then raise exception 'procurement_conflict'; end if;
 if s.archived_at is not null and p_op not in ('archive','restore','cancel') then raise exception 'procurement_conflict'; end if;
 if coalesce(char_length(p_value),0)>500 then raise exception 'procurement_invalid'; end if;
 next_state:=o.status;
 if p_actor is not null then
   case p_op
     when 'send' then
       if o.status<>'draft' then raise exception 'procurement_conflict'; end if;
       select nullif(trim(x.name),'') into purchase_name from public.stores st join public.organizations x on st.organization_id=x.id where st.id=o.store_id;
       if purchase_name is null then raise exception 'procurement_buyer_name'; end if;
       next_state:='sent';
     when 'cancel' then if o.status not in ('draft','sent','accepted') then raise exception 'procurement_conflict'; end if; next_state:='cancelled';
     when 'receive' then
       if o.status<>'shipped' then raise exception 'procurement_conflict'; end if;
       delivery:=p_value::date;
       if delivery is null or delivery> (now() at time zone 'Asia/Tokyo')::date then raise exception 'procurement_invalid'; end if;
       next_state:='received'; event_detail:=jsonb_build_object('received_date',delivery);
     when 'pay' then if o.status<>'invoiced' then raise exception 'procurement_conflict'; end if; next_state:='paid';
     when 'archive' then
       if o.status not in ('draft','cancelled','declined','paid') then raise exception 'procurement_open_orders'; end if;
       apply_archive:=true;
     when 'restore' then if o.archived_at is null then raise exception 'procurement_conflict'; end if; apply_restore:=true;
     else raise exception 'procurement_forbidden';
   end case;
 else
   case p_op
     when 'accept' then if o.status<>'sent' then raise exception 'procurement_conflict'; end if; next_state:='accepted';
     when 'decline' then if o.status<>'sent' then raise exception 'procurement_conflict'; end if; next_state:='declined';
     when 'ship' then if o.status<>'accepted' then raise exception 'procurement_conflict'; end if; next_state:='shipped';
     when 'invoice' then
       if o.status<>'received' or o.received_date is null then raise exception 'procurement_conflict'; end if;
       if s.registration_number is null or coalesce(char_length(trim(p_value)),0) not between 1 and 80 then raise exception 'procurement_invoice_required'; end if;
       invoice_no:=trim(p_value);
       select jsonb_agg(jsonb_build_object('rate',rate,'subtotal',subtotal,'tax',tax) order by rate),sum(subtotal+tax)
       into tax_summary,total from (
         select rate,subtotal,floor(subtotal::numeric*rate/100)::bigint as tax from (
           select (x->>'tax_rate')::integer as rate,sum((x->>'quantity')::bigint*(x->>'unit_price')::bigint) as subtotal from jsonb_array_elements(o.lines) x group by 1
         ) q
       ) t;
       insert into public.procurement_invoices(order_id,store_id,supplier_id,document_number,snapshot)
       values(o.id,o.store_id,s.id,invoice_no,jsonb_build_object('seller',s.name,'buyer',o.buyer_name,'registration_number',s.registration_number,
         'transaction_date',o.received_date,'issue_date',(now() at time zone 'Asia/Tokyo')::date,'lines',o.lines,'tax_summary',tax_summary,'total',total));
       next_state:='invoiced';
     when 'void_invoice' then
       if o.status<>'invoiced' or coalesce(char_length(trim(p_value)),0)<1 then raise exception 'procurement_conflict'; end if;
       update public.procurement_invoices set voided_at=now(),void_reason=trim(p_value) where order_id=o.id and voided_at is null;
       if not found then raise exception 'procurement_conflict'; end if;
       next_state:='received'; event_detail:=jsonb_build_object('note',trim(p_value));
     else raise exception 'procurement_forbidden';
   end case;
   if p_op in ('accept','decline','ship') and nullif(trim(p_value),'') is not null then event_detail:=jsonb_build_object('note',trim(p_value)); end if;
 end if;
 update public.procurement_orders set status=next_state,revision=revision+1,updated_at=now(),
   buyer_name=coalesce(purchase_name,buyer_name),
   supplier_name=case when p_op='send' then s.name else supplier_name end,
   supplier_note=case when p_op in ('accept','decline','ship') and nullif(trim(p_value),'') is not null then trim(p_value) else supplier_note end,
   received_date=coalesce(delivery,received_date), archived_at=case when apply_archive then now() when apply_restore then null else archived_at end where id=o.id;
 insert into public.procurement_events(store_id,supplier_id,order_id,buyer_actor,action,detail) values(o.store_id,s.id,o.id,p_actor,p_op,event_detail);
end $$;

create function public.procurement_supplier_view(p_id uuid,p_hash text,p_order uuid,p_offset integer,p_archived boolean)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.procurement_orders; s public.procurement_suppliers; orders jsonb; bills jsonb; history jsonb; total integer;
begin
 if not public.procurement_supplier_access(p_id,p_hash) then return null; end if;
 select * into s from public.procurement_suppliers where id=p_id;
 if p_order is null then
   select count(*) into total from public.procurement_orders where supplier_id=s.id and store_id=s.store_id and status<>'draft' and buyer_name<>'' and (archived_at is not null)=p_archived;
   select jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id) into orders from (
     select id,status,desired_date,buyer_name,supplier_name,archived_at,updated_at from public.procurement_orders
     where supplier_id=s.id and store_id=s.store_id and status<>'draft' and buyer_name<>'' and (archived_at is not null)=p_archived
     order by updated_at desc,id limit 50 offset greatest(0,least(p_offset,1000000))
   ) q;
 else
   select * into o from public.procurement_orders where id=p_order and supplier_id=s.id and store_id=s.store_id and status<>'draft' and buyer_name<>'';
   if found then
     select jsonb_agg(to_jsonb(q) order by q.issued_at desc) into bills from (select id,document_number,voided_at,void_reason,snapshot,issued_at from public.procurement_invoices where store_id=s.store_id and supplier_id=s.id and order_id=o.id) q;
     select jsonb_agg(to_jsonb(q) order by q.id desc) into history from (select id,action,detail,created_at from public.procurement_events where order_id=o.id and store_id=s.store_id and supplier_id=s.id and action<>'draft' order by id desc limit 100) q;
   end if;
 end if;
 return jsonb_build_object('supplier',jsonb_build_object('name',s.name,'registration_number',s.registration_number),
 'orders',coalesce(orders,'[]'), 'count',coalesce(total,0), 'order',case when o.id is null then null else to_jsonb(o) end,
 'invoices',coalesce(bills,'[]'),'events',coalesce(history,'[]'));
end $$;

revoke all on function public.procurement_buyer_supplier(uuid,uuid,text,uuid,jsonb),public.procurement_supplier_link(uuid,uuid,uuid,text,text),public.procurement_supplier_session(uuid,text,text,text),public.procurement_supplier_access(uuid,text),public.procurement_buyer_draft(uuid,uuid,uuid,uuid,integer,jsonb,text,date),public.procurement_move(uuid,uuid,uuid,text,uuid,integer,text,text),public.procurement_supplier_view(uuid,text,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.procurement_buyer_supplier(uuid,uuid,text,uuid,jsonb),public.procurement_supplier_link(uuid,uuid,uuid,text,text),public.procurement_supplier_session(uuid,text,text,text),public.procurement_supplier_access(uuid,text),public.procurement_buyer_draft(uuid,uuid,uuid,uuid,integer,jsonb,text,date),public.procurement_move(uuid,uuid,uuid,text,uuid,integer,text,text),public.procurement_supplier_view(uuid,text,uuid,integer,boolean) to service_role;
commit;
