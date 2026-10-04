-- Read-only deployment check. Never returns user/store records or secrets.
do $$
declare relation text;
begin
  foreach relation in array array['ai_usage_events','ai_usage_settings','ai_usage_monthly_settings'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=relation and c.relrowsecurity) then raise exception 'AI usage RLS not enabled'; end if;
    if has_table_privilege('anon','public.'||relation,'SELECT') or has_table_privilege('authenticated','public.'||relation,'SELECT') then raise exception 'AI usage exposed to client role'; end if;
  end loop;
  if has_table_privilege('service_role','public.ai_usage_events','UPDATE') or has_table_privilege('service_role','public.ai_usage_events','DELETE') then raise exception 'AI usage is not append-only'; end if;
  if has_function_privilege('authenticated','public.ai_usage_dashboard_summary(date,timestamp with time zone)','EXECUTE')
    or has_function_privilege('authenticated','public.ai_usage_actor_is_active_admin(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.save_ai_usage_monthly_settings(date,numeric,numeric,uuid)','EXECUTE') then raise exception 'AI usage RPC exposed to client role'; end if;
end $$;
select 'PASS: operator-only service boundary and append-only usage evidence' as result, metering_started_at from public.ai_usage_settings where id='default';
