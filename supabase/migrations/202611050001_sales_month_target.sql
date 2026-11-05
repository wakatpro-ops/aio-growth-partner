-- A monthly numeric store setting, not a new business entity. Clearing it
-- retains prior values in the immutable audit history; other profile keys stay intact.
create or replace function public.save_sales_month_target(p_actor uuid,p_store uuid,p_month text,p_amount bigint)
returns void language plpgsql security definer set search_path=public as $$
declare s public.stores; targets jsonb; previous jsonb;
begin
  if not public.menu_actor_allowed(p_actor,p_store,true) then raise exception 'forbidden'; end if;
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or p_month <> to_char(now() at time zone 'Asia/Tokyo','YYYY-MM')
    or (p_amount is not null and (p_amount < 1 or p_amount > 100000000000)) then raise exception 'invalid_target'; end if;
  select * into s from public.stores where id=p_store for update;
  targets := case when jsonb_typeof(s.profile_data->'sales_month_targets')='object' then s.profile_data->'sales_month_targets' else '{}'::jsonb end;
  previous := targets->p_month;
  if p_amount is null then targets := targets-p_month;
  else targets := jsonb_set(targets,array[p_month],to_jsonb(p_amount),true); end if;
  if previous is not distinct from (case when p_amount is null then null else to_jsonb(p_amount) end) then return; end if;
  update public.stores set profile_data=jsonb_set(coalesce(profile_data,'{}'::jsonb),'{sales_month_targets}',targets,true),updated_at=now() where id=p_store;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
  values(s.organization_id,p_store,p_actor,'sales_month_target_updated','store',p_store,'月間売上目標を変更',jsonb_build_object('month',p_month,'before',previous,'after',p_amount));
end;
$$;
revoke all on function public.save_sales_month_target(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.save_sales_month_target(uuid,uuid,text,bigint) to service_role;
