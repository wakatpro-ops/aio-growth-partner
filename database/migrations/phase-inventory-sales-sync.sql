alter table public.inventory_stocks add column if not exists reserved_quantity numeric(12,2) not null default 0;

alter table public.inventory_movements add column if not exists reserved_delta numeric(12,2) not null default 0;
alter table public.inventory_movements add column if not exists balance_after numeric(12,2);
alter table public.inventory_movements add column if not exists reserved_after numeric(12,2);
alter table public.inventory_movements add column if not exists reason text;
alter table public.inventory_movements add column if not exists reference_type text;
alter table public.inventory_movements add column if not exists reference_id uuid;
alter table public.inventory_movements add column if not exists movement_key text;
alter table public.inventory_movements add column if not exists occurred_at timestamptz not null default now();

create unique index if not exists inventory_movements_store_key_unique on public.inventory_movements(store_id, movement_key) where movement_key is not null;
create index if not exists inventory_movements_item_time_idx on public.inventory_movements(item_id, occurred_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default '個',
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);
create index if not exists order_items_order_idx on public.order_items(store_id, order_id, sort_order) where archived_at is null;

create table if not exists public.import_item_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  import_job_id uuid not null references public.data_import_jobs(id) on delete cascade,
  source_item_key text not null,
  source_item_name text not null,
  source_item_code text,
  suggested_item_id uuid references public.items(id) on delete set null,
  confirmed_item_id uuid references public.items(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'ignored')),
  confidence numeric(5,4),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_job_id, source_item_key)
);
create index if not exists import_item_matches_job_idx on public.import_item_matches(store_id, import_job_id, status);

alter table public.data_import_jobs add column if not exists source_url text;
alter table public.data_import_jobs add column if not exists item_matching_status text not null default 'pending';
alter table public.sales_transaction_items add column if not exists item_match_status text not null default 'unmatched';
do $$ begin
  alter table public.data_import_jobs add constraint data_import_jobs_item_matching_status_check check (item_matching_status in ('pending', 'confirmed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sales_transaction_items add constraint sales_transaction_items_item_match_status_check check (item_match_status in ('unmatched', 'confirmed', 'ignored'));
exception when duplicate_object then null; end $$;

create or replace function public.apply_inventory_movement(
  p_store_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_reserved_delta numeric default 0,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_movement_key text default null,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_existing_id uuid;
  v_movement_id uuid;
  v_quantity numeric(12,2);
  v_reserved numeric(12,2);
begin
  select s.organization_id into v_organization_id
  from public.stores s
  join public.items i on i.store_id = s.id and i.id = p_item_id
  where s.id = p_store_id and s.archived_at is null and i.archived_at is null;
  if v_organization_id is null then raise exception '店舗または在庫対象が見つかりません。'; end if;

  if p_movement_key is not null then
    select id into v_existing_id from public.inventory_movements where store_id = p_store_id and movement_key = p_movement_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.inventory_stocks (organization_id, store_id, item_id, quantity, reserved_quantity)
  values (v_organization_id, p_store_id, p_item_id, 0, 0)
  on conflict (item_id) do nothing;

  select quantity, reserved_quantity into v_quantity, v_reserved
  from public.inventory_stocks where item_id = p_item_id for update;

  if p_movement_key is not null then
    select id into v_existing_id from public.inventory_movements where store_id = p_store_id and movement_key = p_movement_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  v_quantity := v_quantity + coalesce(p_quantity_delta, 0);
  v_reserved := greatest(0, v_reserved + coalesce(p_reserved_delta, 0));
  update public.inventory_stocks
  set quantity = v_quantity, reserved_quantity = v_reserved, updated_at = now()
  where item_id = p_item_id;

  insert into public.inventory_movements (
    organization_id, store_id, item_id, movement_type, quantity_delta, reserved_delta,
    balance_after, reserved_after, note, reason, reference_type, reference_id,
    movement_key, created_by, occurred_at
  ) values (
    v_organization_id, p_store_id, p_item_id, p_movement_type, coalesce(p_quantity_delta, 0), coalesce(p_reserved_delta, 0),
    v_quantity, v_reserved, p_reason, p_reason, p_reference_type, p_reference_id,
    p_movement_key, p_actor_user_id, now()
  ) returning id into v_movement_id;
  return v_movement_id;
end;
$$;

revoke all on function public.apply_inventory_movement(uuid, uuid, text, numeric, numeric, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_inventory_movement(uuid, uuid, text, numeric, numeric, text, text, uuid, text, uuid) to service_role;

create or replace function public.is_org_editor(org_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.role_key in ('org_owner', 'store_manager', 'staff')
      and member.status = 'active'
      and member.archived_at is null
  );
$$;

alter table public.order_items enable row level security;
alter table public.import_item_matches enable row level security;
drop policy if exists "read org order items" on public.order_items;
drop policy if exists "write org order items" on public.order_items;
drop policy if exists "read org import item matches" on public.import_item_matches;
drop policy if exists "write org import item matches" on public.import_item_matches;
create policy "read org order items" on public.order_items for select using (public.is_platform_admin() or public.is_org_member(organization_id));
create policy "write org order items" on public.order_items for all using (public.is_platform_admin() or public.is_org_editor(organization_id)) with check (public.is_platform_admin() or public.is_org_editor(organization_id));
create policy "read org import item matches" on public.import_item_matches for select using (public.is_platform_admin() or public.is_org_member(organization_id));
create policy "write org import item matches" on public.import_item_matches for all using (public.is_platform_admin() or public.is_org_editor(organization_id)) with check (public.is_platform_admin() or public.is_org_editor(organization_id));

insert into public.modules (key, name, description, category, is_core)
values
  ('inventory_automation', '在庫自動連動', '受注・売上・取消・返品と在庫変動履歴を連動します。', 'operations', false),
  ('sales_pdf_import', '売上帳票PDF取込', '売上帳票PDFを表形式へ整理し、確認後に取り込みます。', 'data', false),
  ('google_sheets_import', 'Googleスプレッドシート取込', '共有されたGoogleスプレッドシートを確認して売上へ取り込みます。', 'data', false)
on conflict (key) do update set name = excluded.name, description = excluded.description, category = excluded.category;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select key, module_key, true from public.industry_types
cross join (values ('inventory_automation'), ('sales_pdf_import'), ('google_sheets_import')) modules(module_key)
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;
update public.industry_types set default_feature_flags = default_feature_flags || '{"inventory_automation":true,"sales_pdf_import":true,"google_sheets_import":true}'::jsonb;
update public.stores set feature_flags = feature_flags || '{"inventory_automation":true,"sales_pdf_import":true,"google_sheets_import":true}'::jsonb;
