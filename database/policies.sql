alter table public.user_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.industry_types enable row level security;
alter table public.modules enable row level security;
alter table public.industry_modules enable row level security;
alter table public.stores enable row level security;
alter table public.feature_flags enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.dashboard_layouts enable row level security;
alter table public.role_permissions enable row level security;
alter table public.plan_limits enable row level security;
alter table public.billing_integrations enable row level security;
alter table public.accounting_integrations enable row level security;
alter table public.applications enable row level security;
alter table public.ai_generation_logs enable row level security;
alter table public.post_generations enable row level security;
alter table public.review_reply_generations enable row level security;
alter table public.aio_diagnoses enable row level security;
alter table public.items enable row level security;
alter table public.inventory_stocks enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customers enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid()
      and role = 'platform_admin'
  );
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
  );
$$;

create policy "read own profile or admin" on public.user_profiles
for select using (user_id = auth.uid() or public.is_platform_admin());

create policy "read member organizations" on public.organizations
for select using (public.is_org_member(id) or public.is_platform_admin());

create policy "read org members" on public.organization_members
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read public config authenticated" on public.industry_types
for select to authenticated using (true);

create policy "read modules authenticated" on public.modules
for select to authenticated using (true);

create policy "read industry modules authenticated" on public.industry_modules
for select to authenticated using (true);

create policy "read org stores" on public.stores
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org stores" on public.stores
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read config flags authenticated" on public.feature_flags
for select to authenticated using (true);

create policy "read prompts authenticated" on public.ai_prompt_templates
for select to authenticated using (is_active = true);

create policy "admin write prompts" on public.ai_prompt_templates
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "read dashboard layouts authenticated" on public.dashboard_layouts
for select to authenticated using (true);

create policy "read role permissions authenticated" on public.role_permissions
for select to authenticated using (true);

create policy "read plan limits authenticated" on public.plan_limits
for select to authenticated using (true);

create policy "read billing org" on public.billing_integrations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read accounting org" on public.accounting_integrations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "anonymous applications insert" on public.applications
for insert to anon with check (true);

create policy "admin read applications" on public.applications
for select using (public.is_platform_admin());

create policy "read own ai logs or admin" on public.ai_generation_logs
for select using (
  user_id = auth.uid()
  or public.is_org_member(organization_id)
  or public.is_platform_admin()
);

create policy "read post generations org" on public.post_generations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read review generations org" on public.review_reply_generations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read diagnoses org" on public.aio_diagnoses
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org items" on public.items
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org items" on public.items
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org inventory stocks" on public.inventory_stocks
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org inventory stocks" on public.inventory_stocks
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org inventory movements" on public.inventory_movements
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org inventory movements" on public.inventory_movements
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org customers" on public.customers
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org customers" on public.customers
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org estimates" on public.estimates
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org estimates" on public.estimates
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org estimate items" on public.estimate_items
for select using (
  exists (
    select 1 from public.estimates
    where estimates.id = estimate_items.estimate_id
      and (public.is_org_member(estimates.organization_id) or public.is_platform_admin())
  )
);

create policy "write org estimate items" on public.estimate_items
for all using (
  exists (
    select 1 from public.estimates
    where estimates.id = estimate_items.estimate_id
      and (public.is_org_member(estimates.organization_id) or public.is_platform_admin())
  )
)
with check (
  exists (
    select 1 from public.estimates
    where estimates.id = estimate_items.estimate_id
      and (public.is_org_member(estimates.organization_id) or public.is_platform_admin())
  )
);

create policy "read org invoices" on public.invoices
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org invoices" on public.invoices
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org invoice items" on public.invoice_items
for select using (
  exists (
    select 1 from public.invoices
    where invoices.id = invoice_items.invoice_id
      and (public.is_org_member(invoices.organization_id) or public.is_platform_admin())
  )
);

create policy "write org invoice items" on public.invoice_items
for all using (
  exists (
    select 1 from public.invoices
    where invoices.id = invoice_items.invoice_id
      and (public.is_org_member(invoices.organization_id) or public.is_platform_admin())
  )
)
with check (
  exists (
    select 1 from public.invoices
    where invoices.id = invoice_items.invoice_id
      and (public.is_org_member(invoices.organization_id) or public.is_platform_admin())
  )
);
