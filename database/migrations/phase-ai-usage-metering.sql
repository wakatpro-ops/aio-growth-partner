-- Operator-only AI cost evidence. Never store prompts, responses, or error bodies.
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  attempt integer not null check (attempt >= 1),
  feature text not null check (length(feature) between 1 and 160),
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'openai',
  endpoint text not null,
  model text not null,
  service_tier text,
  status text not null check (status in ('success','error')),
  http_status integer check (http_status between 100 and 599),
  request_id text,
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens >= 0),
  cache_write_tokens bigint check (cache_write_tokens >= 0),
  web_search_calls integer check (web_search_calls >= 0),
  token_cost_usd numeric(18,10) check (token_cost_usd >= 0),
  tool_cost_usd numeric(18,10) check (tool_cost_usd >= 0),
  estimated_cost_usd numeric(18,10) check (estimated_cost_usd >= 0),
  cost_status text not null check (cost_status in ('estimated','unpriced','usage_missing')),
  price_version text,
  pricing_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(pricing_snapshot) = 'object'),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  unique (operation_id, attempt),
  check ((cost_status = 'estimated' and estimated_cost_usd is not null) or (cost_status <> 'estimated' and estimated_cost_usd is null)),
  check (cached_input_tokens is null or input_tokens is null or cached_input_tokens <= input_tokens),
  check (cache_write_tokens is null or input_tokens is null or cache_write_tokens <= input_tokens)
);
create index if not exists ai_usage_events_time_idx on public.ai_usage_events(created_at);
create index if not exists ai_usage_events_store_time_idx on public.ai_usage_events(store_id, created_at);
create index if not exists ai_usage_events_feature_time_idx on public.ai_usage_events(feature, created_at);

-- NULL until the metered application is actually activated. Migration time is NOT coverage start.
create table if not exists public.ai_usage_settings (
  id text primary key default 'default' check (id = 'default'),
  metering_started_at timestamptz
);
insert into public.ai_usage_settings(id) values ('default') on conflict (id) do nothing;

-- Monthly configuration, not store-business revenue or a payment ledger.
create table if not exists public.ai_usage_monthly_settings (
  month date primary key check (month = date_trunc('month', month)::date and month between '2000-01-01' and '2099-12-01'),
  usd_jpy numeric(12,6) check (usd_jpy > 0 and usd_jpy <= 10000),
  service_revenue_jpy numeric(14,2) check (service_revenue_jpy >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_settings enable row level security;
alter table public.ai_usage_monthly_settings enable row level security;
revoke all on public.ai_usage_events, public.ai_usage_settings, public.ai_usage_monthly_settings from public, anon, authenticated, service_role;
grant select, insert on public.ai_usage_events to service_role;
grant select, insert, update on public.ai_usage_settings, public.ai_usage_monthly_settings to service_role;
-- Even platform-admin JWTs cannot bypass the server's active/banned-user checks.
-- Operator reads are through the authenticated server loader only.
drop policy if exists "operator read ai usage" on public.ai_usage_events;
drop policy if exists "operator read ai usage settings" on public.ai_usage_settings;
drop policy if exists "operator read ai usage monthly settings" on public.ai_usage_monthly_settings;

-- Narrow boolean gate; service_role cannot and must not receive broad SELECT on auth.users.
-- The definer can only answer whether the supplied actor is currently an active, unbanned operator.
create or replace function public.ai_usage_actor_is_active_admin(p_actor_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_actor_user_id and p.role='platform_admin' and p.status='active'
      and p.archived_at is null and (u.banned_until is null or u.banned_until<=pg_catalog.now())
  );
$$;
revoke all on function public.ai_usage_actor_is_active_admin(uuid) from public,anon,authenticated;
grant execute on function public.ai_usage_actor_is_active_admin(uuid) to service_role;

create or replace function public.save_ai_usage_monthly_settings(p_month date, p_usd_jpy numeric, p_service_revenue_jpy numeric, p_actor_user_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare prior public.ai_usage_monthly_settings;
begin
  if not public.ai_usage_actor_is_active_admin(p_actor_user_id) then
    raise exception 'Active platform administrator required';
  end if;
  if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month<'2000-01-01' or p_month>'2099-12-01' then raise exception 'Invalid month'; end if;
  if p_usd_jpy is not null and (p_usd_jpy<=0 or p_usd_jpy>10000 or p_usd_jpy<>round(p_usd_jpy,6)) then raise exception 'Invalid exchange rate'; end if;
  if p_service_revenue_jpy is not null and (p_service_revenue_jpy<0 or p_service_revenue_jpy>=1000000000000 or p_service_revenue_jpy<>round(p_service_revenue_jpy,2)) then raise exception 'Invalid service revenue'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage_month:'||p_month::text,0));
  select * into prior from public.ai_usage_monthly_settings where month=p_month for update;
  insert into public.ai_usage_monthly_settings(month,usd_jpy,service_revenue_jpy,updated_at,updated_by)
  values(p_month,p_usd_jpy,p_service_revenue_jpy,now(),p_actor_user_id)
  on conflict(month) do update set usd_jpy=excluded.usd_jpy, service_revenue_jpy=excluded.service_revenue_jpy,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into public.audit_logs(actor_user_id,action_type,target_type,message,metadata)
  values(p_actor_user_id,'ai_usage_monthly_settings_updated','ai_usage_monthly_settings','AI利用料の月別換算・税抜サービス売上設定を更新',jsonb_build_object('month',p_month,'source','operator_manual','previous',jsonb_build_object('usd_jpy',prior.usd_jpy,'service_revenue_jpy',prior.service_revenue_jpy),'next',jsonb_build_object('usd_jpy',p_usd_jpy,'service_revenue_jpy',p_service_revenue_jpy)));
end $$;
revoke all on function public.save_ai_usage_monthly_settings(date,numeric,numeric,uuid) from public,anon,authenticated;
grant execute on function public.save_ai_usage_monthly_settings(date,numeric,numeric,uuid) to service_role;

-- Call only after the metered production application is running. Never infer deployment from migration.
create or replace function public.activate_ai_usage_metering(p_started_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
declare changed integer;
begin
  if p_started_at is null or p_started_at>now() or p_started_at<'2026-01-01'::timestamptz then raise exception 'Invalid metering start'; end if;
  update public.ai_usage_settings set metering_started_at=p_started_at where id='default' and metering_started_at is null;
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.activate_ai_usage_metering(timestamptz) from public,anon,authenticated;
grant execute on function public.activate_ai_usage_metering(timestamptz) to service_role;

create or replace function public.ai_usage_zero_metrics()
returns jsonb language sql immutable security invoker set search_path=public as $$
  select '{"requests":0,"operations":0,"retries":0,"errors":0,"inputTokens":0,"outputTokens":0,"cachedInputTokens":0,"cacheWriteTokens":0,"cacheDetailsMissingCount":0,"webSearchCalls":0,"tokenCostUsd":0,"toolCostUsd":0,"usageMissingCount":0,"unpricedCount":0,"knownCostRequests":0,"estimatedCostUsd":0}'::jsonb;
$$;
revoke all on function public.ai_usage_zero_metrics() from public,anon,authenticated;
grant execute on function public.ai_usage_zero_metrics() to service_role;

-- Aggregation happens in PostgreSQL: no PostgREST max-row truncation of request evidence.
create or replace function public.ai_usage_dashboard_summary(p_month date,p_now timestamptz default now())
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare month_start timestamptz; month_end timestamptz; result jsonb;
begin
  if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month<'2000-01-01' or p_month>'2099-12-01' or p_now is null then raise exception 'Invalid dashboard period'; end if;
  month_start:=p_month::timestamp at time zone 'Asia/Tokyo';
  month_end:=(p_month+interval '1 month')::timestamp at time zone 'Asia/Tokyo';
  with evidence as materialized (
    select e.*, case when s.id is null then '店舗未割当・申込前' when s.archived_at is not null then s.name||'（削除済み）' else s.name end as store_label
    from public.ai_usage_events e left join public.stores s on s.id=e.store_id
    where e.created_at>=least(month_start,p_now-interval '48 hours') and e.created_at<p_now
      and (e.created_at<month_end or e.created_at>=p_now-interval '48 hours')
  ), dimensions as (
    select e.*, 'month' as segment, d.scope, d.key, d.label
    from evidence e cross join lateral (values
      ('total','total','total'),('store',coalesce(e.store_id::text,'unassigned'),e.store_label),
      ('feature',e.feature,e.feature),('day',to_char(e.created_at at time zone 'Asia/Tokyo','YYYY-MM-DD'),to_char(e.created_at at time zone 'Asia/Tokyo','YYYY-MM-DD'))
    ) as d(scope,key,label) where e.created_at>=month_start and e.created_at<month_end
    union all
    select e.*, case when e.created_at>=p_now-interval '24 hours' then 'current' else 'previous' end as segment,d.scope,d.key,d.label
    from evidence e cross join lateral (values
      ('total','total','total'),('store',coalesce(e.store_id::text,'unassigned'),e.store_label),('feature',e.feature,e.feature)
    ) as d(scope,key,label) where e.created_at>=p_now-interval '48 hours'
  ), grouped as (
    select segment,scope,key,label,jsonb_build_object(
      'requests',count(*),'operations',count(distinct operation_id),'retries',count(*) filter(where attempt>1),
      'errors',count(*) filter(where status='error'),
      'inputTokens',coalesce(sum(input_tokens),0),'outputTokens',coalesce(sum(output_tokens),0),
      'cachedInputTokens',coalesce(sum(cached_input_tokens),0),'cacheWriteTokens',coalesce(sum(cache_write_tokens),0),
      'cacheDetailsMissingCount',count(*) filter(where input_tokens is not null and (cached_input_tokens is null or cache_write_tokens is null)),
      'webSearchCalls',coalesce(sum(web_search_calls),0),'tokenCostUsd',coalesce(sum(token_cost_usd),0),'toolCostUsd',coalesce(sum(tool_cost_usd),0),
      'usageMissingCount',count(*) filter(where cost_status='usage_missing'),'unpricedCount',count(*) filter(where cost_status='unpriced'),
      'knownCostRequests',count(*) filter(where cost_status='estimated' and estimated_cost_usd is not null),
      'estimatedCostUsd',coalesce(sum(estimated_cost_usd) filter(where cost_status='estimated'),0)
    ) as metrics from dimensions group by segment,scope,key,label
  )
  select jsonb_build_object(
    'totals',coalesce((select metrics from grouped where segment='month' and scope='total'),public.ai_usage_zero_metrics()),
    'stores',coalesce((select jsonb_agg(metrics||jsonb_build_object('key',key,'label',label) order by (metrics->>'estimatedCostUsd')::numeric desc,(metrics->>'requests')::bigint desc,key) from grouped where segment='month' and scope='store'),'[]'::jsonb),
    'features',coalesce((select jsonb_agg(metrics||jsonb_build_object('key',key,'label',label) order by (metrics->>'estimatedCostUsd')::numeric desc,(metrics->>'requests')::bigint desc,key) from grouped where segment='month' and scope='feature'),'[]'::jsonb),
    'days',coalesce((select jsonb_agg(metrics||jsonb_build_object('key',key,'label',label) order by key) from grouped where segment='month' and scope='day'),'[]'::jsonb),
    'recent',jsonb_build_object(
      'current',coalesce((select metrics from grouped where segment='current' and scope='total'),public.ai_usage_zero_metrics()),
      'previous',coalesce((select metrics from grouped where segment='previous' and scope='total'),public.ai_usage_zero_metrics()),
      'groups',coalesce((select jsonb_agg(jsonb_build_object('key',g.key,'label',g.label,'scope',g.scope,
        'current',coalesce((select c.metrics from grouped c where c.segment='current' and c.scope=g.scope and c.key=g.key),public.ai_usage_zero_metrics()),
        'previous',coalesce((select p.metrics from grouped p where p.segment='previous' and p.scope=g.scope and p.key=g.key),public.ai_usage_zero_metrics())))
        from (select distinct scope,key,label from grouped where segment in ('current','previous') and scope in ('store','feature')) g),'[]'::jsonb)
    )
  ) into result;
  return result;
end $$;
revoke all on function public.ai_usage_dashboard_summary(date,timestamptz) from public,anon,authenticated;
grant execute on function public.ai_usage_dashboard_summary(date,timestamptz) to service_role;
