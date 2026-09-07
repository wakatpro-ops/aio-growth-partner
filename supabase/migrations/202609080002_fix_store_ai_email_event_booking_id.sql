-- Fix the PL/pgSQL booking_id variable/column ambiguity found by the staging integration test.
create or replace function public.apply_store_ai_email_event(
  p_message_id uuid,
  p_actor_user_id uuid,
  p_automatic boolean default false,
  p_learn_template boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  message_row public.store_ai_email_messages%rowtype;
  inbox_row public.store_ai_inboxes%rowtype;
  template_row public.store_ai_email_templates%rowtype;
  existing_booking public.bookings%rowtype;
  v_booking_id uuid;
  learned_template_id uuid;
  resource_ids uuid[] := '{}'::uuid[];
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_service_name text;
  v_reservation_id text;
  v_event_type text;
  v_provider_key text;
  v_external_provider_key text;
  now_value timestamptz := now();
begin
  if auth.role() <> 'service_role' then raise exception 'メール予約を処理する権限がありません。'; end if;
  if p_automatic and p_learn_template then raise exception '自動処理中に新しい形式を学習することはできません。'; end if;

  select * into message_row from public.store_ai_email_messages where id = p_message_id for update;
  if message_row.id is null or message_row.archived_at is not null then raise exception '対象メールを確認できません。'; end if;
  if message_row.processing_status = 'applied' and message_row.applied_target_id is not null then return message_row.applied_target_id; end if;
  if message_row.category <> 'reservation' or message_row.sensitive then raise exception '予約として反映できるメールではありません。'; end if;

  select * into inbox_row from public.store_ai_inboxes
    where id = message_row.inbox_id and store_id = message_row.store_id
      and organization_id = message_row.organization_id and archived_at is null and status = 'active';
  if inbox_row.id is null then raise exception 'AI受信箱が停止されています。'; end if;
  if not exists (select 1 from public.stores where id = message_row.store_id and organization_id = message_row.organization_id and status = 'active' and archived_at is null) then
    raise exception '店舗を確認できません。';
  end if;

  v_event_type := coalesce(message_row.booking_event_type, 'created');
  v_provider_key := coalesce(nullif(message_row.booking_provider, ''), 'email_unknown');
  v_external_provider_key := left('email_' || v_provider_key, 100);
  v_reservation_id := nullif(btrim(message_row.extracted_data->>'reservation_id'), '');
  v_customer_name := nullif(btrim(message_row.extracted_data->>'customer_name'), '');
  v_customer_email := nullif(btrim(message_row.extracted_data->>'customer_email'), '');
  v_customer_phone := nullif(btrim(message_row.extracted_data->>'customer_phone'), '');
  v_service_name := nullif(btrim(message_row.extracted_data->>'service_name'), '');

  if p_automatic then
    select * into template_row from public.store_ai_email_templates
      where id = message_row.matched_template_id
        and organization_id = message_row.organization_id and store_id = message_row.store_id
        and sender_email = lower(coalesce(message_row.sender_email, ''))
        and provider_key = message_row.booking_provider
        and event_type = message_row.booking_event_type
        and template_fingerprint = message_row.template_fingerprint
        and status = 'active' and archived_at is null;
    if template_row.id is null or not inbox_row.auto_apply_reservations then
      raise exception 'この形式は自動処理の承認条件を満たしていません。';
    end if;
    if not message_row.known_template or message_row.classification_confidence < 0.98 then
      raise exception 'メール形式または解析精度が変わったため確認してください。';
    end if;
  end if;

  if v_reservation_id is null then raise exception '予約番号を確認してください。'; end if;
  if v_event_type in ('created','changed') then
    if v_customer_name is null then raise exception 'お客様名を確認してください。'; end if;
    begin v_starts_at := (message_row.extracted_data->>'starts_at')::timestamptz; exception when others then raise exception '予約日時を確認してください。'; end;
    begin v_ends_at := (message_row.extracted_data->>'ends_at')::timestamptz; exception when others then raise exception '終了日時を確認してください。'; end;
    if v_ends_at <= v_starts_at then raise exception '終了日時は開始日時より後にしてください。'; end if;
  end if;

  select * into existing_booking from public.bookings
    where organization_id = message_row.organization_id and store_id = message_row.store_id
      and external_booking_id = v_reservation_id
      and external_provider in (v_external_provider_key, 'email_inbox')
      and archived_at is null
    order by case when external_provider = v_external_provider_key then 0 else 1 end
    limit 1 for update;

  if v_event_type = 'created' then
    if existing_booking.id is not null then raise exception '同じ予約番号がすでにあります。重複か変更通知かを確認してください。'; end if;
    v_booking_id := public.create_store_booking(
      message_row.organization_id, message_row.store_id, null, null, 'confirmed', 'external',
      v_starts_at, v_ends_at, v_customer_name, coalesce(v_customer_phone, ''), coalesce(v_customer_email, ''),
      coalesce(v_service_name, ''), 'AI受信箱から' || case when p_automatic then '自動' else '確認後に' end || '反映',
      '{}'::uuid[], p_actor_user_id
    );
    update public.bookings set
      external_provider = v_external_provider_key,
      external_booking_id = v_reservation_id,
      metadata = metadata || jsonb_build_object('store_ai_email_message_id', message_row.id, 'email_provider', v_provider_key, 'automatic', p_automatic)
    where id = v_booking_id;
  elsif v_event_type = 'changed' then
    if existing_booking.id is null then raise exception '変更対象の予約番号が見つかりません。元の予約を確認してください。'; end if;
    if existing_booking.status in ('completed','cancelled','no_show') then raise exception '完了・取消済みの予約は自動変更できません。'; end if;
    select coalesce(array_agg(resource_id), '{}'::uuid[]) into resource_ids
      from public.booking_resource_allocations where booking_resource_allocations.booking_id = existing_booking.id and archived_at is null;
    perform public.assert_booking_resources_available(existing_booking.store_id, v_starts_at, v_ends_at, resource_ids, existing_booking.id);
    update public.bookings set
      starts_at = v_starts_at,
      ends_at = v_ends_at,
      customer_name = v_customer_name,
      customer_email = coalesce(v_customer_email, existing_booking.customer_email),
      customer_phone = coalesce(v_customer_phone, existing_booking.customer_phone),
      service_name = coalesce(v_service_name, existing_booking.service_name),
      external_provider = v_external_provider_key,
      metadata = metadata || jsonb_build_object('store_ai_email_message_id', message_row.id, 'email_provider', v_provider_key, 'automatic', p_automatic, 'email_event', 'changed'),
      updated_by = p_actor_user_id,
      updated_at = now_value
    where id = existing_booking.id;
    v_booking_id := existing_booking.id;
    insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message, metadata)
    values (message_row.organization_id, message_row.store_id, p_actor_user_id, 'booking_email_changed', 'booking', v_booking_id,
      v_customer_name || '様の予約変更メールを反映しました。', jsonb_build_object('automatic', p_automatic, 'provider', v_provider_key));
  elsif v_event_type = 'cancelled' then
    if existing_booking.id is null then raise exception 'キャンセル対象の予約番号が見つかりません。元の予約を確認してください。'; end if;
    if existing_booking.status = 'cancelled' then raise exception 'この予約はすでにキャンセル済みです。'; end if;
    update public.bookings set
      status = 'cancelled',
      external_provider = v_external_provider_key,
      metadata = metadata || jsonb_build_object('store_ai_email_message_id', message_row.id, 'email_provider', v_provider_key, 'automatic', p_automatic, 'email_event', 'cancelled'),
      updated_by = p_actor_user_id,
      updated_at = now_value
    where id = existing_booking.id;
    v_booking_id := existing_booking.id;
    insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message, metadata)
    values (message_row.organization_id, message_row.store_id, p_actor_user_id, 'booking_email_cancelled', 'booking', v_booking_id,
      existing_booking.customer_name || '様の予約キャンセルメールを反映しました。', jsonb_build_object('automatic', p_automatic, 'provider', v_provider_key));
  else
    raise exception '予約メールの種類を確認してください。';
  end if;

  if p_learn_template then
    if p_actor_user_id is null or message_row.sender_email is null or message_row.template_fingerprint is null or not message_row.known_template or message_row.classification_confidence < 0.98 then
      raise exception 'このメールは自動処理する形式として記憶できません。送信元と必須項目を確認してください。';
    end if;
    select * into template_row from public.store_ai_email_templates
      where organization_id = message_row.organization_id and store_id = message_row.store_id
        and sender_email = lower(message_row.sender_email)
        and provider_key = v_provider_key
        and event_type = v_event_type
        and template_fingerprint = message_row.template_fingerprint
        and archived_at is null for update;
    if template_row.id is null then
      insert into public.store_ai_email_templates (
        organization_id, store_id, sender_email, sender_domain, provider_key, event_type,
        template_fingerprint, approved_message_id, match_count, auto_processed_count,
        last_matched_at, created_by, updated_by
      ) values (
        message_row.organization_id, message_row.store_id, lower(message_row.sender_email),
        coalesce(message_row.sender_domain, split_part(lower(message_row.sender_email), '@', 2)),
        v_provider_key, v_event_type, message_row.template_fingerprint, message_row.id, 1, 0,
        message_row.received_at, p_actor_user_id, p_actor_user_id
      ) returning id into learned_template_id;
    else
      update public.store_ai_email_templates set status = 'active', updated_at = now_value, updated_by = p_actor_user_id
        where id = template_row.id returning id into learned_template_id;
    end if;
    update public.store_ai_inboxes set
      auto_apply_reservations = true,
      trusted_senders = case when lower(message_row.sender_email) = any(trusted_senders) then trusted_senders else array_append(trusted_senders, lower(message_row.sender_email)) end,
      updated_at = now_value,
      updated_by = p_actor_user_id
    where id = inbox_row.id;
    insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message, metadata)
    values (message_row.organization_id, message_row.store_id, p_actor_user_id, 'store_ai_email_template_learned', 'store_ai_email_template', learned_template_id,
      '確認済みの予約メール形式を、この店舗だけの自動処理ルールとして記憶しました。',
      jsonb_build_object('provider', v_provider_key, 'event_type', v_event_type, 'sender_domain', message_row.sender_domain));
  elsif p_automatic then
    learned_template_id := template_row.id;
    update public.store_ai_email_templates set
      match_count = match_count + 1,
      auto_processed_count = auto_processed_count + 1,
      last_matched_at = now_value,
      updated_at = now_value
    where id = learned_template_id;
  else
    learned_template_id := message_row.matched_template_id;
  end if;

  update public.store_ai_email_messages set
    processing_status = 'applied',
    requires_human_confirmation = false,
    applied_target_type = 'booking',
    applied_target_id = v_booking_id,
    matched_template_id = coalesce(learned_template_id, matched_template_id),
    reviewed_at = now_value,
    reviewed_by = p_actor_user_id,
    updated_at = now_value
  where id = message_row.id;
  return v_booking_id;
end;
$$;

revoke all on function public.apply_store_ai_email_event(uuid, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.apply_store_ai_email_event(uuid, uuid, boolean, boolean) to service_role;
