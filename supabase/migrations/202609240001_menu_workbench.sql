-- Additive migration. No customer data is deleted; documents are archival records.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-images','menu-images',true,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
alter table public.items add column if not exists availability text not null default 'available'
  check (availability in ('available', 'sold_out', 'paused'));

create table if not exists public.stock_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  store_id uuid not null references public.stores(id),
  kind text not null check (kind in ('receipt', 'purchase', 'waste')),
  status text not null default 'draft' check (status in ('draft','confirmed','reversed')),
  vendor text not null default '',
  document_date date not null default current_date,
  lines jsonb not null default '[]',
  source_receipt_id uuid references public.expense_receipts(id),
  note text not null default '',
  revision integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);
create unique index if not exists stock_documents_receipt_unique on public.stock_documents(store_id, source_receipt_id) where source_receipt_id is not null;
alter table public.stock_documents enable row level security;
revoke all on public.stock_documents from anon, authenticated;
grant all on public.stock_documents to service_role;

create or replace function public.menu_actor_allowed(p_actor uuid, p_store uuid, p_manager boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_profiles p join auth.users u on u.id = p.user_id
    join public.stores s on s.id = p_store
    join public.organizations o on o.id = s.organization_id
    where p.user_id = p_actor and p.status = 'active' and p.archived_at is null
      and (u.banned_until is null or u.banned_until < now())
      and s.status = 'active' and s.archived_at is null and o.status = 'active' and o.archived_at is null
      and (p.role = 'platform_admin' or exists (
        select 1 from public.organization_members m where m.user_id = p_actor and m.organization_id = s.organization_id
        and m.status = 'active' and m.archived_at is null
        and (m.role_key in ('org_owner','store_manager') or (not p_manager and m.role_key = 'staff'))
      ) or exists (
        select 1 from public.store_memberships m where m.user_id = p_actor and m.store_id = s.id and m.organization_id = s.organization_id
        and m.status = 'active' and m.archived_at is null
        and (m.role_key = 'store_manager' or (not p_manager and m.role_key = 'staff'))
      ))
  );
$$;
revoke all on function public.menu_actor_allowed(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.menu_actor_allowed(uuid,uuid,boolean) to service_role;

create or replace function public.set_menu_availability(p_actor uuid, p_store uuid, p_item uuid, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception '操作する権限がありません'; end if;
  if p_value not in ('available','sold_out','paused') or p_value is null then raise exception '状態が不正です'; end if;
  select jsonb_build_object('availability', availability, 'status', status) into v_before from public.items where id=p_item and store_id=p_store and archived_at is null for update;
  if not found then raise exception '商品が見つかりません'; end if;
  update public.items set availability=p_value, status=case when p_value='paused' then 'inactive' else 'active' end, updated_at=now() where id=p_item;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    select organization_id,p_store,p_actor,'menu_availability_updated','item',p_item,'販売状態を変更',jsonb_build_object('before',v_before,'after',p_value) from public.items where id=p_item;
end;
$$;
revoke all on function public.set_menu_availability(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_menu_availability(uuid,uuid,uuid,text) to service_role;

create or replace function public.save_stock_document(p_actor uuid,p_store uuid,p_id uuid,p_kind text,p_vendor text,p_date date,p_lines jsonb,p_note text,p_revision integer,p_source uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_doc public.stock_documents; v_org uuid; v_line jsonb; v_item public.items; v_manager boolean;
begin
  v_manager := public.menu_actor_allowed(p_actor,p_store,true);
  if not public.menu_actor_allowed(p_actor,p_store,false) or (p_kind='purchase' and not v_manager) then raise exception '操作する権限がありません'; end if;
  if p_kind not in ('receipt','purchase','waste') or p_date is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception '内容を確認してください'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_doc from public.stock_documents where id=p_id for update;
  if found then
    if v_doc.store_id=p_store and v_doc.status='draft' and v_doc.archived_at is null and v_doc.revision=p_revision+1 and v_doc.kind=p_kind and v_doc.source_receipt_id is not distinct from p_source and v_doc.lines=p_lines and v_doc.vendor=left(coalesce(p_vendor,''),200) and v_doc.document_date=p_date and v_doc.note=left(coalesce(p_note,''),1000) then return p_id; end if;
    if v_doc.store_id<>p_store or v_doc.status<>'draft' or v_doc.archived_at is not null or v_doc.revision<>p_revision or v_doc.kind<>p_kind or v_doc.source_receipt_id is distinct from p_source then raise exception '内容が変更されています。開き直してください'; end if;
  elsif p_revision<>0 then raise exception '下書きが見つかりません'; end if;
  select organization_id into v_org from public.stores where id=p_store;
  if p_source is not null and not exists(select 1 from public.expense_receipts where id=p_source and store_id=p_store and archived_at is null) then raise exception '伝票が見つかりません'; end if;
  if (select count(distinct x->>'item_id') from jsonb_array_elements(p_lines) x) <> jsonb_array_length(p_lines) then raise exception '同じ商品はまとめてください'; end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from public.items where id=(v_line->>'item_id')::uuid and store_id=p_store and archived_at is null and is_stock_managed;
    if not found or v_item.unit is distinct from v_line->>'unit' then raise exception '商品または単位を確認してください。単位換算は自動では行いません'; end if;
    if (v_line->>'quantity')::numeric is null or (v_line->>'quantity')::numeric not between 0.01 and 1000000 or round((v_line->>'quantity')::numeric,2)<>(v_line->>'quantity')::numeric then raise exception '数量を確認してください'; end if;
    if not v_manager and v_line ? 'unit_price' then raise exception '原価変更の権限がありません'; end if;
    if v_line ? 'unit_price' and ((v_line->>'unit_price')::numeric is null or (v_line->>'unit_price')::numeric not between 0 and 100000000) then raise exception '単価を確認してください'; end if;
  end loop;
  insert into public.stock_documents(id,organization_id,store_id,kind,vendor,document_date,lines,note,created_by,source_receipt_id,revision)
    values(p_id,v_org,p_store,p_kind,left(coalesce(p_vendor,''),200),p_date,p_lines,left(coalesce(p_note,''),1000),p_actor,p_source,1)
    on conflict(id) do update set vendor=excluded.vendor,document_date=excluded.document_date,lines=excluded.lines,note=excluded.note,revision=stock_documents.revision+1,updated_at=now();
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message) values(v_org,p_store,p_actor,'stock_document_saved','stock_document',p_id,'在庫文書の下書きを保存');
  return p_id;
end; $$;
revoke all on function public.save_stock_document(uuid,uuid,uuid,text,text,date,jsonb,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_stock_document(uuid,uuid,uuid,text,text,date,jsonb,text,integer,uuid) to service_role;

create or replace function public.transition_stock_document(p_actor uuid,p_store uuid,p_id uuid,p_action text,p_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_doc public.stock_documents; v_line jsonb; v_item public.items; v_delta numeric; v_stock numeric; v_reserved numeric; v_manager boolean;
begin
  v_manager := public.menu_actor_allowed(p_actor,p_store,true);
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception '操作する権限がありません'; end if;
  select * into v_doc from public.stock_documents where id=p_id and store_id=p_store for update;
  if not found or (v_doc.kind='purchase' and not v_manager) then raise exception '文書が見つからないか、権限がありません'; end if;
  if p_action='confirm' and v_doc.status='confirmed' then return; end if;
  if p_action='reverse' and v_doc.status='reversed' then return; end if;
  if v_doc.revision<>p_revision then raise exception '内容が変更されています。開き直してください'; end if;
  if p_action in ('archive','restore') then
    if v_doc.status<>'draft' then raise exception '確定済みの文書は取消で履歴を残してください'; end if;
    update public.stock_documents set archived_at=case when p_action='archive' then now() else null end,archived_by=case when p_action='archive' then p_actor else null end,revision=revision+1,updated_at=now() where id=p_id;
  elsif p_action in ('confirm','reverse') then
    if v_doc.archived_at is not null or (p_action='confirm' and v_doc.status<>'draft') or (p_action='reverse' and (v_doc.status<>'confirmed' or not v_manager)) then raise exception 'この操作はできません'; end if;
    if p_action='confirm' and v_doc.source_receipt_id is not null then
      -- Serialize confirmation of source-derived receipts within a store.
      perform pg_advisory_xact_lock(hashtextextended(p_store::text||':receipt',0));
      if exists(select 1 from public.stock_documents d join public.expense_receipts a on a.id=d.source_receipt_id join public.expense_receipts b on b.id=v_doc.source_receipt_id
        where d.store_id=p_store and d.id<>p_id and d.status='confirmed' and (a.id=b.id or (a.file_sha256 is not null and a.file_sha256=b.file_sha256))) then raise exception '同じ伝票ファイルはすでに入荷済みです。履歴を確認してください'; end if;
    end if;
    if v_doc.kind<>'purchase' then
      for v_line in select * from jsonb_array_elements(v_doc.lines) order by value->>'item_id' loop
        select * into v_item from public.items where id=(v_line->>'item_id')::uuid and store_id=p_store and archived_at is null and is_stock_managed for update;
        if not found or v_item.unit is distinct from v_line->>'unit' then raise exception '商品や単位が変更されました'; end if;
        v_delta := (v_line->>'quantity')::numeric * case when v_doc.kind='waste' then -1 else 1 end * case when p_action='reverse' then -1 else 1 end;
        insert into public.inventory_stocks(organization_id,store_id,item_id,quantity,reserved_quantity) values(v_doc.organization_id,p_store,v_item.id,0,0) on conflict(item_id) do nothing;
        select quantity,reserved_quantity into v_stock,v_reserved from public.inventory_stocks where item_id=v_item.id for update;
        if v_delta<0 and v_stock+v_delta<v_reserved then raise exception '利用できる在庫が不足しています'; end if;
        perform public.apply_inventory_movement(p_store,v_item.id,case when p_action='reverse' then 'adjustment' else v_doc.kind end,v_delta,0,'文書確認: '||v_doc.document_date,'stock_document',p_id,'document:'||p_id||':'||p_action||':'||v_item.id,p_actor);
      end loop;
    end if;
    update public.stock_documents set status=case when p_action='confirm' then 'confirmed' else 'reversed' end,revision=revision+1,updated_at=now() where id=p_id;
  else raise exception '操作が不正です'; end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata) values(v_doc.organization_id,p_store,p_actor,'stock_document_'||p_action,'stock_document',p_id,'在庫文書の状態を変更',jsonb_build_object('kind',v_doc.kind));
end; $$;
revoke all on function public.transition_stock_document(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.transition_stock_document(uuid,uuid,uuid,text,integer) to service_role;

-- Direct authenticated writes must not bypass the manager-only master-data UI.
create or replace function public.guard_menu_master_write() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='authenticated' and not public.menu_actor_allowed(auth.uid(),case when TG_OP='DELETE' then old.store_id else new.store_id end,true) then raise exception '商品マスタの変更は店長権限が必要です'; end if;
  if TG_OP='DELETE' then return old; end if; return new;
end; $$;
drop trigger if exists guard_menu_master_write on public.items;
create trigger guard_menu_master_write before insert or update or delete on public.items for each row execute function public.guard_menu_master_write();

create or replace function public.manual_inventory_change(p_actor uuid,p_store uuid,p_item uuid,p_type text,p_quantity numeric,p_expected numeric,p_reason text,p_key uuid,p_reorder numeric,p_cost numeric default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_item public.items; v_stock public.inventory_stocks; v_id uuid; v_delta numeric;
begin
  if not public.menu_actor_allowed(p_actor,p_store,true) then raise exception '店長権限が必要です'; end if;
  if p_type not in ('receipt','stocktake','waste','return_in','transfer_in','transfer_out','adjustment') or p_key is null or length(trim(p_reason))=0 or p_quantity is null or abs(p_quantity)>1000000 or round(p_quantity,2)<>p_quantity or p_reorder<0 or p_cost<0 then raise exception '入力内容を確認してください'; end if;
  if (p_type='stocktake' and p_quantity<0) or (p_type not in ('stocktake','adjustment') and p_quantity<=0) then raise exception '数量を確認してください'; end if;
  select * into v_item from public.items where id=p_item and store_id=p_store and archived_at is null and is_stock_managed for update;
  if not found then raise exception '商品が見つかりません'; end if;
  select id into v_id from public.inventory_movements where store_id=p_store and movement_key='manual:'||p_key;
  if found then return v_id; end if;
  insert into public.inventory_stocks(organization_id,store_id,item_id,quantity,reserved_quantity) values(v_item.organization_id,p_store,p_item,0,0) on conflict(item_id) do nothing;
  select * into v_stock from public.inventory_stocks where item_id=p_item for update;
  if p_type='stocktake' and v_stock.quantity is distinct from p_expected then raise exception '在庫が更新されました。数量を確認し直してください'; end if;
  v_delta:=case when p_type='stocktake' then p_quantity-v_stock.quantity when p_type in ('waste','transfer_out') then -p_quantity else p_quantity end;
  if v_delta<0 and v_stock.quantity+v_delta<v_stock.reserved_quantity then raise exception '利用できる在庫が不足しています'; end if;
  v_id:=public.apply_inventory_movement(p_store,p_item,p_type,v_delta,0,p_reason,'manual',null,'manual:'||p_key,p_actor);
  update public.inventory_stocks set reorder_point=p_reorder where item_id=p_item;
  if p_type='receipt' and p_cost>0 then update public.items set cost_price=p_cost,updated_at=now() where id=p_item; end if;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message) values(v_item.organization_id,p_store,p_actor,'inventory_manual_change','inventory_movement',v_id,p_reason);
  return v_id;
end; $$;
revoke all on function public.manual_inventory_change(uuid,uuid,uuid,text,numeric,numeric,text,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.manual_inventory_change(uuid,uuid,uuid,text,numeric,numeric,text,uuid,numeric,numeric) to service_role;
commit;
