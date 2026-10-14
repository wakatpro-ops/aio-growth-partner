-- Additive Instagram Login state and atomic connection lifecycle. Facebook rows are untouched.
begin;
create table if not exists public.instagram_oauth_attempts (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  redirect_uri text not null,
  expected_account_id uuid,
  expected_updated_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  completed_at timestamptz
);
alter table public.instagram_oauth_attempts enable row level security;
revoke all on public.instagram_oauth_attempts from public,anon,authenticated;
grant all on public.instagram_oauth_attempts to service_role;

create or replace function public.start_instagram_oauth(p_actor uuid,p_store uuid,p_hash text,p_redirect text)
returns void language plpgsql security definer set search_path=public as $$
declare a public.external_channel_accounts;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_redirect not in ('https://app.aioboost.jp/api/instagram/oauth/callback','https://staging.aioboost.jp/api/instagram/oauth/callback') then raise exception 'invalid_oauth'; end if;
  perform 1 from public.stores where id=p_store for update;
  select * into a from public.external_channel_accounts where store_id=p_store and channel='instagram' and external_provider='instagram_login';
  -- Expired authentication attempts are replaceable temporary state, not business history.
  delete from public.instagram_oauth_attempts where actor_id=p_actor and store_id=p_store and expires_at<now()-interval '1 day';
  insert into public.instagram_oauth_attempts(state_hash,actor_id,store_id,redirect_uri,expected_account_id,expected_updated_at)
    values(p_hash,p_actor,p_store,p_redirect,a.id,a.updated_at);
end; $$;

create or replace function public.consume_instagram_oauth(p_actor uuid,p_hash text,p_redirect text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.instagram_oauth_attempts;
begin
  select * into a from public.instagram_oauth_attempts where state_hash=p_hash for update;
  if not found or a.actor_id is distinct from p_actor or a.redirect_uri is distinct from p_redirect or a.expires_at<=now() or a.consumed_at is not null then raise exception 'invalid_oauth'; end if;
  if not public.menu_actor_allowed(p_actor,a.store_id,false) then raise exception 'forbidden'; end if;
  update public.instagram_oauth_attempts set consumed_at=now() where state_hash=p_hash;
  return jsonb_build_object('store_id',a.store_id,'redirect_uri',a.redirect_uri);
end; $$;

create or replace function public.finish_instagram_oauth(p_actor uuid,p_hash text,p_external_id text,p_username text,p_account_type text,p_cipher text,p_expires timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare attempt public.instagram_oauth_attempts; a public.external_channel_accounts; s public.stores; account_id uuid;
begin
  select * into attempt from public.instagram_oauth_attempts where state_hash=p_hash for update;
  if not found or attempt.actor_id is distinct from p_actor or attempt.consumed_at is null or attempt.completed_at is not null or attempt.expires_at<=now() then raise exception 'invalid_oauth'; end if;
  if not public.menu_actor_allowed(p_actor,attempt.store_id,false) then raise exception 'forbidden'; end if;
  if p_external_id is null or p_external_id !~ '^\d+$' or p_username is null or length(p_username) not between 1 and 100 or p_account_type is null or upper(p_account_type) not in ('BUSINESS','MEDIA_CREATOR','CREATOR') or p_cipher is null or p_cipher not like 'ig1:%' or length(p_cipher)>16000 or p_expires is null or p_expires<=now() or p_expires>now()+interval '90 days' then raise exception 'invalid_account'; end if;
  select * into s from public.stores where id=attempt.store_id for update;
  select * into a from public.external_channel_accounts where store_id=s.id and channel='instagram' and external_provider='instagram_login' for update;
  if a.id is distinct from attempt.expected_account_id or a.updated_at is distinct from attempt.expected_updated_at then raise exception 'connection_changed'; end if;
  insert into public.external_channel_accounts(organization_id,store_id,channel,external_provider,external_account_id,account_name,connection_status,access_token_encrypted,token_expires_at,scopes,connected_at,disconnected_at,error_message,metadata,updated_at)
    values(s.organization_id,s.id,'instagram','instagram_login',p_external_id,'@'||p_username,'connected',p_cipher,p_expires,array['instagram_business_basic','instagram_business_content_publish'],now(),null,null,jsonb_build_object('auth_flow','instagram_login','username',p_username,'account_type',p_account_type,'connected_by',p_actor,'connection_generation',gen_random_uuid(),'token_issued_at',now()),now())
    on conflict(store_id,channel,external_provider) do update set external_account_id=excluded.external_account_id,account_name=excluded.account_name,connection_status=excluded.connection_status,access_token_encrypted=excluded.access_token_encrypted,token_expires_at=excluded.token_expires_at,scopes=excluded.scopes,connected_at=excluded.connected_at,disconnected_at=null,error_message=null,metadata=excluded.metadata,updated_at=excluded.updated_at returning id into account_id;
  update public.instagram_oauth_attempts set completed_at=now() where state_hash=p_hash;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(s.organization_id,s.id,p_actor,'instagram_login_connected','external_channel_account',account_id,'Instagramに直接接続しました。Facebook連携は維持しています。',jsonb_build_object('external_account_id',p_external_id,'auth_flow','instagram_login'));
  return account_id;
end; $$;

create or replace function public.disconnect_instagram_login(p_actor uuid,p_store uuid)
returns void language plpgsql security definer set search_path=public as $$
declare a public.external_channel_accounts;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  perform 1 from public.stores where id=p_store for update;
  select * into a from public.external_channel_accounts where store_id=p_store and channel='instagram' and external_provider='instagram_login' for update;
  if not found then return; end if;
  update public.external_channel_accounts set connection_status='disconnected',access_token_encrypted=null,token_expires_at=null,disconnected_at=now(),error_message=null,metadata=metadata||jsonb_build_object('connection_generation',gen_random_uuid()),updated_at=now() where id=a.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(a.organization_id,p_store,p_actor,'instagram_login_disconnected','external_channel_account',a.id,'この店舗のInstagram直接接続を解除しました。接続・投稿履歴とFacebook連携は保持します。','{}');
end; $$;

create or replace function public.refresh_instagram_login(p_actor uuid,p_store uuid,p_account uuid,p_old_cipher text,p_new_cipher text,p_expires timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
declare a public.external_channel_accounts;
begin
  if p_actor is not null and not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.stores s join public.organizations o on o.id=s.organization_id where s.id=p_store and s.status='active' and s.archived_at is null and o.status='active' and o.archived_at is null) then raise exception 'forbidden'; end if;
  -- Null actor is the service-only publish worker; never exposed to anon/authenticated.
  select * into a from public.external_channel_accounts where id=p_account and store_id=p_store and channel='instagram' and external_provider='instagram_login' for update;
  if not found or a.connection_status<>'connected' or a.access_token_encrypted is distinct from p_old_cipher then return false; end if;
  if not public.menu_actor_allowed((a.metadata->>'connected_by')::uuid,p_store,false) then raise exception 'forbidden'; end if;
  if a.token_expires_at is null or a.token_expires_at<=now() or a.metadata->>'token_issued_at' is null or (a.metadata->>'token_issued_at')::timestamptz>now()-interval '24 hours' or p_new_cipher is null or p_new_cipher not like 'ig1:%' or p_expires is null or p_expires<=now() or p_expires>now()+interval '90 days' then raise exception 'invalid_refresh'; end if;
  update public.external_channel_accounts set access_token_encrypted=p_new_cipher,token_expires_at=p_expires,metadata=metadata||jsonb_build_object('token_issued_at',now()),updated_at=now() where id=a.id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(a.organization_id,p_store,p_actor,'instagram_login_refreshed','external_channel_account',a.id,'Instagramの認証期限を更新しました。','{}');
  return true;
end; $$;

create or replace function public.validate_instagram_publish_connection(p_store uuid,p_account uuid,p_generation text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.external_channel_accounts a
    where a.id=p_account and a.store_id=p_store and a.channel='instagram' and a.external_provider='instagram_login'
      and a.connection_status='connected' and a.access_token_encrypted is not null and a.token_expires_at>now()
      and a.metadata->>'connection_generation'=p_generation
      and public.menu_actor_allowed((a.metadata->>'connected_by')::uuid,p_store,false));
$$;

revoke all on function public.start_instagram_oauth(uuid,uuid,text,text),public.consume_instagram_oauth(uuid,text,text),public.finish_instagram_oauth(uuid,text,text,text,text,text,timestamptz),public.disconnect_instagram_login(uuid,uuid),public.refresh_instagram_login(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.start_instagram_oauth(uuid,uuid,text,text),public.consume_instagram_oauth(uuid,text,text),public.finish_instagram_oauth(uuid,text,text,text,text,text,timestamptz),public.disconnect_instagram_login(uuid,uuid),public.refresh_instagram_login(uuid,uuid,uuid,text,text,timestamptz) to service_role;
revoke all on function public.validate_instagram_publish_connection(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.validate_instagram_publish_connection(uuid,uuid,text) to service_role;

create or replace function public.guard_instagram_login_write()
returns trigger language plpgsql set search_path=public as $$
begin
  if TG_OP='DELETE' then
    if current_user in ('anon','authenticated') and old.external_provider='instagram_login' then raise exception 'server_only_instagram_connection'; end if;
    return old;
  end if;
  if current_user in ('anon','authenticated') and (new.external_provider='instagram_login' or (TG_OP='UPDATE' and old.external_provider='instagram_login')) then raise exception 'server_only_instagram_connection'; end if;
  return new;
end; $$;
revoke all on function public.guard_instagram_login_write() from public,anon,authenticated;
grant execute on function public.guard_instagram_login_write() to service_role;
drop trigger if exists guard_instagram_login_write on public.external_channel_accounts;
create trigger guard_instagram_login_write before insert or update or delete on public.external_channel_accounts for each row execute function public.guard_instagram_login_write();
commit;
