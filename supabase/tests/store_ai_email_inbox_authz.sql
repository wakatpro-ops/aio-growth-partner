-- Authorization, tenant boundary, template learning, and sensitive-data minimization checks for Issues #144/#148. Always rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','mail-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','92000000-0000-4000-8000-000000000002','authenticated','authenticated','mail-other@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','93000000-0000-4000-8000-000000000003','authenticated','authenticated','mail-unaffiliated@example.invalid','',now(),'{}','{}',now(),now());

insert into public.user_profiles (user_id,display_name,role,status) values
  ('91000000-0000-4000-8000-000000000001','Mail owner','user','active'),
  ('92000000-0000-4000-8000-000000000002','Mail other','user','active'),
  ('93000000-0000-4000-8000-000000000003','Mail unaffiliated','user','active');
insert into public.organizations (id,name,owner_user_id,status) values
  ('9a000000-0000-4000-8000-000000000001','Mail organization A','91000000-0000-4000-8000-000000000001','active'),
  ('9b000000-0000-4000-8000-000000000002','Mail organization B','92000000-0000-4000-8000-000000000002','active');
insert into public.stores (id,organization_id,industry_type_key,name,status) values
  ('9c000000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001',(select key from public.industry_types where is_active order by key limit 1),'Mail store A','active'),
  ('9d000000-0000-4000-8000-000000000002','9b000000-0000-4000-8000-000000000002',(select key from public.industry_types where is_active order by key limit 1),'Mail store B','active');
insert into public.organization_members (organization_id,user_id,role_key,status) values
  ('9a000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','org_owner','active'),
  ('9b000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','org_owner','active');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  begin perform id from public.store_ai_inboxes; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Owner direct read was not denied'; end if;
end $$;
do $$ declare denied boolean := false; begin
  begin perform id from public.store_ai_email_templates; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Owner direct template read was not denied'; end if;
end $$;
do $$ declare denied boolean := false; begin
  begin perform public.apply_store_ai_email_event('00000000-0000-4000-8000-000000000000', '91000000-0000-4000-8000-000000000001', false, true); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Owner direct learning RPC was not denied'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  begin perform id from public.store_ai_email_messages; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Unaffiliated direct read was not denied'; end if;
end $$;
do $$ declare denied boolean := false; begin
  begin perform id from public.store_ai_email_templates; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Unaffiliated direct template read was not denied'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  begin insert into public.store_ai_email_messages (inbox_id,organization_id,store_id,message_fingerprint,summary,category) values ((select id from public.store_ai_inboxes where store_id='9c000000-0000-4000-8000-000000000001'),'9a000000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001','browser-bypass','bypass','unknown'); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Other organization direct insert was not denied'; end if;
end $$;

reset role;
set local role service_role;
do $$
declare cross_org_denied boolean := false; cross_org_template_denied boolean := false; sensitive_denied boolean := false;
begin
  begin insert into public.store_ai_email_messages (inbox_id,organization_id,store_id,message_fingerprint,summary,category) values ((select id from public.store_ai_inboxes where store_id='9c000000-0000-4000-8000-000000000001'),'9b000000-0000-4000-8000-000000000002','9c000000-0000-4000-8000-000000000001','cross-org','cross','unknown'); exception when foreign_key_violation then cross_org_denied := true; end;
  begin insert into public.store_ai_email_templates (organization_id,store_id,sender_email,sender_domain,provider_key,event_type,template_fingerprint) values ('9b000000-0000-4000-8000-000000000002','9c000000-0000-4000-8000-000000000001','booking@example.invalid','example.invalid','email_example_invalid','created',repeat('a',64)); exception when foreign_key_violation then cross_org_template_denied := true; end;
  begin insert into public.store_ai_email_messages (inbox_id,organization_id,store_id,message_fingerprint,subject,summary,category,processing_status,sensitive,extracted_data) values ((select id from public.store_ai_inboxes where store_id='9c000000-0000-4000-8000-000000000001'),'9a000000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001','secret-retention','パスワード再設定 123456','秘密本文','sensitive','rejected',true,'{"otp":"123456"}'); exception when check_violation then sensitive_denied := true; end;
  if not cross_org_denied then raise exception 'Cross-organization store mismatch was not denied'; end if;
  if not cross_org_template_denied then raise exception 'Cross-organization template mismatch was not denied'; end if;
  if not sensitive_denied then raise exception 'Sensitive body retention was not denied'; end if;
end $$;

rollback;
