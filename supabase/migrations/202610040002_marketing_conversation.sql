-- Additive workflow state. Business drafts use the existing archive/restore lifecycle.
begin;
create table if not exists public.marketing_conversations (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (store_id,user_id)
);
alter table public.marketing_conversations enable row level security;
revoke all on public.marketing_conversations from public,anon,authenticated;
grant all on public.marketing_conversations to service_role;

create or replace function public.save_marketing_conversation(p_actor uuid,p_store uuid,p_revision integer,p_state jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_revision integer;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text)>12000 then raise exception 'invalid_state'; end if;
  insert into public.marketing_conversations(store_id,user_id) values(p_store,p_actor) on conflict do nothing;
  update public.marketing_conversations set state=p_state,revision=revision+1,updated_at=now()
    where store_id=p_store and user_id=p_actor and revision=p_revision returning revision into v_revision;
  if not found then raise exception 'stale_revision'; end if;
  return v_revision;
end; $$;
revoke all on function public.save_marketing_conversation(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_marketing_conversation(uuid,uuid,integer,jsonb) to service_role;

create or replace function public.finish_marketing_conversation(p_actor uuid,p_store uuid,p_lease text,p_title text,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.marketing_conversations; s public.stores; a uuid; d uuid; channel text; provider text;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  select * into v from public.marketing_conversations where store_id=p_store and user_id=p_actor for update;
  if not found or v.state->>'step'<>'generating' or v.state->>'lease' is distinct from p_lease then raise exception 'stale_generation'; end if;
  if length(trim(p_title)) not between 1 and 160 or length(trim(p_body)) not between 1 and 4000 then raise exception 'invalid_draft'; end if;
  channel := v.state#>>'{brief,channel}';
  if channel not in ('google_business_profile','instagram') then raise exception 'invalid_channel'; end if;
  select * into s from public.stores where id=p_store;
  a := (v.state->>'generationId')::uuid;
  provider := case when channel='google_business_profile' then 'google' else 'meta' end;
  insert into public.growth_actions(id,organization_id,store_id,industry_type_key,title,summary,reason,target_channel,status,source_type,external_provider,metadata)
    values(a,s.organization_id,s.id,s.industry_type_key,p_title,'会話から作成した投稿下書き','利用者が内容を確認して作成',channel,'drafted','guided_conversation',provider,jsonb_build_object('created_by',p_actor));
  insert into public.growth_action_drafts(organization_id,store_id,growth_action_id,channel,title,body,external_provider)
    values(s.organization_id,s.id,a,channel,p_title,p_body,provider) returning id into d;
  -- This is an unsent draft; never enqueue external publication or approve automatically.
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(s.organization_id,s.id,p_actor,'marketing_conversation_drafted','growth_action',a,'会話から投稿下書きを作成',jsonb_build_object('draft_id',d));
  update public.marketing_conversations set state=(v.state - 'lease' - 'leaseUntil') || jsonb_build_object('step','done','actionId',a),revision=revision+1,updated_at=now()
    where store_id=p_store and user_id=p_actor;
  return a;
end; $$;
revoke all on function public.finish_marketing_conversation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_marketing_conversation(uuid,uuid,text,text,text) to service_role;
commit;
