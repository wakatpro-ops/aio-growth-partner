begin;
-- Only sanitized operational codes. Never persist a provider response or key.
create or replace function public.fail_air_regi_sync(p_id uuid,p_lease uuid,p_code text)
returns void language plpgsql security definer set search_path=public as $$
declare c public.air_regi_connections; v_pause boolean;
begin
  if p_code is null or p_code not in ('provider_unavailable','invalid_provider_data','store_mismatch','sync_failed',
    'authentication_required','ip_not_registered','rate_limited','accounting_review_required','history_expired') then p_code:='sync_failed'; end if;
  v_pause:=p_code in ('authentication_required','store_mismatch','accounting_review_required','history_expired');
  update public.air_regi_connections set status=case when v_pause then 'paused' else 'error' end,
    last_error_code=p_code,failure_count=failure_count+1,
    next_sync_at=now()+make_interval(secs=>least(86400,interval_seconds*power(2,least(failure_count+1,8))::integer)),
    lease_id=null,lease_until=null,updated_at=now()
    where id=p_id and lease_id=p_lease and archived_at is null returning * into c;
  if found and v_pause then
    update public.external_data_sources set status='inactive',updated_at=now() where id=c.data_source_id;
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
      values(c.organization_id,c.store_id,c.authorized_by,'air_regi_sync_paused','air_regi_connection',c.id,
        '確認が必要なためAirレジ同期を停止。売上履歴は保持',jsonb_build_object('code',p_code));
  end if;
end; $$;
revoke all on function public.fail_air_regi_sync(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_air_regi_sync(uuid,uuid,text) to service_role;
commit;
