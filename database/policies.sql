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
alter table public.marketing_drafts enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.image_caption_jobs enable row level security;
alter table public.demand_alerts enable row level security;
alter table public.external_data_sources enable row level security;
alter table public.data_import_jobs enable row level security;
alter table public.data_import_files enable row level security;
alter table public.data_column_mappings enable row level security;
alter table public.sales_transactions enable row level security;
alter table public.sales_transaction_items enable row level security;
alter table public.normalized_sales_summaries enable row level security;
alter table public.import_error_rows enable row level security;
alter table public.sales_ai_reports enable row level security;
alter table public.sales_ai_report_sections enable row level security;
alter table public.sales_anomaly_flags enable row level security;
alter table public.demand_forecasts enable row level security;
alter table public.inventory_alerts enable row level security;
alter table public.recommended_actions enable row level security;
alter table public.growth_actions enable row level security;
alter table public.growth_action_drafts enable row level security;
alter table public.growth_action_logs enable row level security;
alter table public.growth_action_schedule_items enable row level security;
alter table public.growth_action_approvals enable row level security;
alter table public.growth_action_draft_versions enable row level security;
alter table public.external_channel_accounts enable row level security;
alter table public.google_oauth_connections enable row level security;
alter table public.google_business_profiles enable row level security;
alter table public.google_gmail_settings enable row level security;
alter table public.google_calendar_settings enable row level security;
alter table public.external_publish_jobs enable row level security;
alter table public.external_integration_logs enable row level security;
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

drop policy if exists "read own profile or admin" on public.user_profiles;
drop policy if exists "read member organizations" on public.organizations;
drop policy if exists "read org members" on public.organization_members;
drop policy if exists "read public config authenticated" on public.industry_types;
drop policy if exists "read modules authenticated" on public.modules;
drop policy if exists "read industry modules authenticated" on public.industry_modules;
drop policy if exists "read org stores" on public.stores;
drop policy if exists "write org stores" on public.stores;
drop policy if exists "read config flags authenticated" on public.feature_flags;
drop policy if exists "read prompts authenticated" on public.ai_prompt_templates;
drop policy if exists "admin write prompts" on public.ai_prompt_templates;
drop policy if exists "read dashboard layouts authenticated" on public.dashboard_layouts;
drop policy if exists "read role permissions authenticated" on public.role_permissions;
drop policy if exists "read plan limits authenticated" on public.plan_limits;
drop policy if exists "read billing org" on public.billing_integrations;
drop policy if exists "read accounting org" on public.accounting_integrations;
drop policy if exists "anonymous applications insert" on public.applications;
drop policy if exists "admin read applications" on public.applications;
drop policy if exists "read own ai logs or admin" on public.ai_generation_logs;
drop policy if exists "read post generations org" on public.post_generations;
drop policy if exists "read review generations org" on public.review_reply_generations;
drop policy if exists "read diagnoses org" on public.aio_diagnoses;
drop policy if exists "read org marketing drafts" on public.marketing_drafts;
drop policy if exists "write org marketing drafts" on public.marketing_drafts;
drop policy if exists "read org ai recommendations" on public.ai_recommendations;
drop policy if exists "write org ai recommendations" on public.ai_recommendations;
drop policy if exists "read org image caption jobs" on public.image_caption_jobs;
drop policy if exists "write org image caption jobs" on public.image_caption_jobs;
drop policy if exists "read org demand alerts" on public.demand_alerts;
drop policy if exists "write org demand alerts" on public.demand_alerts;
drop policy if exists "read org external data sources" on public.external_data_sources;
drop policy if exists "write org external data sources" on public.external_data_sources;
drop policy if exists "read org data import jobs" on public.data_import_jobs;
drop policy if exists "write org data import jobs" on public.data_import_jobs;
drop policy if exists "read org data import files" on public.data_import_files;
drop policy if exists "write org data import files" on public.data_import_files;
drop policy if exists "read org data column mappings" on public.data_column_mappings;
drop policy if exists "write org data column mappings" on public.data_column_mappings;
drop policy if exists "read org sales transactions" on public.sales_transactions;
drop policy if exists "write org sales transactions" on public.sales_transactions;
drop policy if exists "read org sales transaction items" on public.sales_transaction_items;
drop policy if exists "write org sales transaction items" on public.sales_transaction_items;
drop policy if exists "read org normalized sales summaries" on public.normalized_sales_summaries;
drop policy if exists "write org normalized sales summaries" on public.normalized_sales_summaries;
drop policy if exists "read org import error rows" on public.import_error_rows;
drop policy if exists "write org import error rows" on public.import_error_rows;
drop policy if exists "read org sales ai reports" on public.sales_ai_reports;
drop policy if exists "write org sales ai reports" on public.sales_ai_reports;
drop policy if exists "read org sales ai report sections" on public.sales_ai_report_sections;
drop policy if exists "write org sales ai report sections" on public.sales_ai_report_sections;
drop policy if exists "read org sales anomaly flags" on public.sales_anomaly_flags;
drop policy if exists "write org sales anomaly flags" on public.sales_anomaly_flags;
drop policy if exists "read org demand forecasts" on public.demand_forecasts;
drop policy if exists "write org demand forecasts" on public.demand_forecasts;
drop policy if exists "read org inventory alerts" on public.inventory_alerts;
drop policy if exists "write org inventory alerts" on public.inventory_alerts;
drop policy if exists "read org recommended actions" on public.recommended_actions;
drop policy if exists "write org recommended actions" on public.recommended_actions;
drop policy if exists "read org growth actions" on public.growth_actions;
drop policy if exists "write org growth actions" on public.growth_actions;
drop policy if exists "read org growth action drafts" on public.growth_action_drafts;
drop policy if exists "write org growth action drafts" on public.growth_action_drafts;
drop policy if exists "read org growth action logs" on public.growth_action_logs;
drop policy if exists "write org growth action logs" on public.growth_action_logs;
drop policy if exists "read org growth action schedule items" on public.growth_action_schedule_items;
drop policy if exists "write org growth action schedule items" on public.growth_action_schedule_items;
drop policy if exists "read org growth action approvals" on public.growth_action_approvals;
drop policy if exists "write org growth action approvals" on public.growth_action_approvals;
drop policy if exists "read org growth action draft versions" on public.growth_action_draft_versions;
drop policy if exists "write org growth action draft versions" on public.growth_action_draft_versions;
drop policy if exists "read org external channel accounts" on public.external_channel_accounts;
drop policy if exists "write org external channel accounts" on public.external_channel_accounts;
drop policy if exists "read org google oauth connections" on public.google_oauth_connections;
drop policy if exists "write org google oauth connections" on public.google_oauth_connections;
drop policy if exists "read org google business profiles" on public.google_business_profiles;
drop policy if exists "write org google business profiles" on public.google_business_profiles;
drop policy if exists "read org google gmail settings" on public.google_gmail_settings;
drop policy if exists "write org google gmail settings" on public.google_gmail_settings;
drop policy if exists "read org google calendar settings" on public.google_calendar_settings;
drop policy if exists "write org google calendar settings" on public.google_calendar_settings;
drop policy if exists "read org external publish jobs" on public.external_publish_jobs;
drop policy if exists "write org external publish jobs" on public.external_publish_jobs;
drop policy if exists "read org external integration logs" on public.external_integration_logs;
drop policy if exists "write org external integration logs" on public.external_integration_logs;
drop policy if exists "read org items" on public.items;
drop policy if exists "write org items" on public.items;
drop policy if exists "read org inventory stocks" on public.inventory_stocks;
drop policy if exists "write org inventory stocks" on public.inventory_stocks;
drop policy if exists "read org inventory movements" on public.inventory_movements;
drop policy if exists "write org inventory movements" on public.inventory_movements;
drop policy if exists "read org customers" on public.customers;
drop policy if exists "write org customers" on public.customers;
drop policy if exists "read org estimates" on public.estimates;
drop policy if exists "write org estimates" on public.estimates;
drop policy if exists "read org estimate items" on public.estimate_items;
drop policy if exists "write org estimate items" on public.estimate_items;
drop policy if exists "read org invoices" on public.invoices;
drop policy if exists "write org invoices" on public.invoices;
drop policy if exists "read org invoice items" on public.invoice_items;
drop policy if exists "write org invoice items" on public.invoice_items;

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

create policy "read org marketing drafts" on public.marketing_drafts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org marketing drafts" on public.marketing_drafts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org ai recommendations" on public.ai_recommendations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org ai recommendations" on public.ai_recommendations
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org image caption jobs" on public.image_caption_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org image caption jobs" on public.image_caption_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org demand alerts" on public.demand_alerts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org demand alerts" on public.demand_alerts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external data sources" on public.external_data_sources
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external data sources" on public.external_data_sources
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org data import jobs" on public.data_import_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org data import jobs" on public.data_import_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org data import files" on public.data_import_files
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org data import files" on public.data_import_files
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org data column mappings" on public.data_column_mappings
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org data column mappings" on public.data_column_mappings
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org sales transactions" on public.sales_transactions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org sales transactions" on public.sales_transactions
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org sales transaction items" on public.sales_transaction_items
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org sales transaction items" on public.sales_transaction_items
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org normalized sales summaries" on public.normalized_sales_summaries
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org normalized sales summaries" on public.normalized_sales_summaries
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org import error rows" on public.import_error_rows
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org import error rows" on public.import_error_rows
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org sales ai reports" on public.sales_ai_reports
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org sales ai reports" on public.sales_ai_reports
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org sales ai report sections" on public.sales_ai_report_sections
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org sales ai report sections" on public.sales_ai_report_sections
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org sales anomaly flags" on public.sales_anomaly_flags
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org sales anomaly flags" on public.sales_anomaly_flags
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org demand forecasts" on public.demand_forecasts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org demand forecasts" on public.demand_forecasts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org inventory alerts" on public.inventory_alerts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org inventory alerts" on public.inventory_alerts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org recommended actions" on public.recommended_actions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org recommended actions" on public.recommended_actions
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth actions" on public.growth_actions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth actions" on public.growth_actions
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action drafts" on public.growth_action_drafts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action drafts" on public.growth_action_drafts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action logs" on public.growth_action_logs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action logs" on public.growth_action_logs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action schedule items" on public.growth_action_schedule_items
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action schedule items" on public.growth_action_schedule_items
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action approvals" on public.growth_action_approvals
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action approvals" on public.growth_action_approvals
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action draft versions" on public.growth_action_draft_versions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action draft versions" on public.growth_action_draft_versions
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external channel accounts" on public.external_channel_accounts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external channel accounts" on public.external_channel_accounts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google oauth connections" on public.google_oauth_connections
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google oauth connections" on public.google_oauth_connections
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google business profiles" on public.google_business_profiles
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google business profiles" on public.google_business_profiles
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google gmail settings" on public.google_gmail_settings
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google gmail settings" on public.google_gmail_settings
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google calendar settings" on public.google_calendar_settings
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google calendar settings" on public.google_calendar_settings
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external publish jobs" on public.external_publish_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external publish jobs" on public.external_publish_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external integration logs" on public.external_integration_logs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external integration logs" on public.external_integration_logs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

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
