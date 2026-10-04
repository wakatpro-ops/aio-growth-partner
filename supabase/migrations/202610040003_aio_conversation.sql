-- Additive workflow state. Business drafts use the existing archive/restore lifecycle.
begin;
alter table public.aio_improvement_tasks add column if not exists draft_body text;
alter table public.aio_improvement_tasks add column if not exists draft_kind text;
create table if not exists public.aio_conversations (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (store_id,user_id)
);
alter table public.aio_conversations enable row level security;
revoke all on public.aio_conversations from public,anon,authenticated;
grant all on public.aio_conversations to service_role;

create or replace function public.save_aio_conversation(p_actor uuid,p_store uuid,p_revision integer,p_state jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_revision integer;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text)>12000 then raise exception 'invalid_state'; end if;
  insert into public.aio_conversations(store_id,user_id) values(p_store,p_actor) on conflict do nothing;
  update public.aio_conversations set state=p_state,revision=revision+1,updated_at=now()
    where store_id=p_store and user_id=p_actor and revision=p_revision returning revision into v_revision;
  if not found then raise exception 'stale_revision'; end if;
  return v_revision;
end; $$;
revoke all on function public.save_aio_conversation(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_aio_conversation(uuid,uuid,integer,jsonb) to service_role;

create or replace function public.finish_aio_conversation(p_actor uuid,p_store uuid,p_lease text,p_title text,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.aio_conversations; s public.stores; a uuid; channel text; source text;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  select * into v from public.aio_conversations where store_id=p_store and user_id=p_actor for update;
  if not found or v.state->>'step' is distinct from 'generating' or v.state->>'lease' is distinct from p_lease then raise exception 'stale_generation'; end if;
  if p_title is null or p_body is null or length(trim(p_title)) not between 1 and 160 or length(trim(p_body)) not between 1 and 2000 then raise exception 'invalid_draft'; end if;
  channel := v.state#>>'{brief,channel}';
  if channel is null or channel not in ('aio_service','aio_profile','aio_questions') then raise exception 'invalid_kind'; end if;
  select * into s from public.stores where id=p_store;
  a := (v.state->>'generationId')::uuid;
  source := case channel when 'aio_service' then 'offering' when 'aio_profile' then 'local' else 'questions' end;
  insert into public.aio_improvement_tasks(id,organization_id,store_id,source_key,title,description,status,source_href,draft_body,draft_kind,publication_target,publication_status,created_by,updated_by)
    values(a,s.organization_id,s.id,source,p_title,'AIとの会話で準備した下書き。内容を確認してから反映してください。','in_progress',
      '/stores/'||s.id||case when channel='aio_questions' then '/marketing/aio-improvement#questions' else '/settings/profile' end,
      p_body,channel,'none','not_published',p_actor,p_actor);
  -- Draft only. Do not modify goals/profile, mark as completed, or publish externally.
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(s.organization_id,s.id,p_actor,'aio_conversation_drafted','aio_improvement_task',a,'会話からAIO改善の下書きを作成',jsonb_build_object('draft_kind',channel));
  update public.aio_conversations set state=(v.state - 'lease' - 'leaseUntil') || jsonb_build_object('step','done','actionId',a),revision=revision+1,updated_at=now()
    where store_id=p_store and user_id=p_actor;
  return a;
end; $$;
revoke all on function public.finish_aio_conversation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_aio_conversation(uuid,uuid,text,text,text) to service_role;
commit;
