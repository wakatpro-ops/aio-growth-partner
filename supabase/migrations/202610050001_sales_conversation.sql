-- Conversation is disposable workflow state; documents retain the existing archive lifecycle.
begin;
create table if not exists public.sales_conversations (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 0,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (store_id,user_id)
);
alter table public.sales_conversations enable row level security;
revoke all on public.sales_conversations from public,anon,authenticated;
grant all on public.sales_conversations to service_role;
create or replace function public.save_sales_conversation(p_actor uuid,p_store uuid,p_revision integer,p_state jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_revision integer;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or octet_length(p_state::text)>12000 then raise exception 'invalid_state'; end if;
  insert into public.sales_conversations(store_id,user_id) values(p_store,p_actor) on conflict do nothing;
  update public.sales_conversations set state=p_state,revision=revision+1,updated_at=now()
    where store_id=p_store and user_id=p_actor and revision=p_revision returning revision into v_revision;
  if not found then raise exception 'stale_revision'; end if;
  return v_revision;
end; $$;
revoke all on function public.save_sales_conversation(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_sales_conversation(uuid,uuid,integer,jsonb) to service_role;

create or replace function public.finish_sales_conversation(p_actor uuid,p_store uuid,p_lease text,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v public.sales_conversations; s public.stores; c public.customers; i public.items;
  a uuid; b jsonb; m jsonb; k text; cust uuid; item uuid; subject text; note text; num text;
  qty numeric; price numeric; rate numeric; inclusion text; amount numeric; subtotal numeric; tax numeric; total numeric;
  t10 numeric; t8 numeric; d date;
begin
  if not public.menu_actor_allowed(p_actor,p_store,false) then raise exception 'forbidden'; end if;
  select * into v from public.sales_conversations where store_id=p_store and user_id=p_actor for update;
  if not found or v.state->>'step' is distinct from 'generating' or v.state->>'lease' is distinct from p_lease then raise exception 'stale_generation'; end if;
  b := v.state->'brief'; m := b->'money'; k := b->>'kind'; subject := b->>'subject';
  if k is null or k not in ('estimates','invoices') or subject is null or length(trim(subject)) not between 1 and 160 or p_note is null or length(trim(p_note)) not between 1 and 600 then raise exception 'invalid_draft'; end if;
  qty := (m->>'quantity')::numeric; price := (m->>'unitPrice')::numeric; rate := (m->>'taxRate')::numeric; inclusion := m->>'taxInclusion';
  if qty is null or price is null or rate is null or inclusion is null or qty <> trunc(qty) or price <> trunc(price)
    or qty not between 1 and 100000 or price not between 0 and 100000000 or qty*price>1000000000
    or rate not in (0,8,10) or inclusion not in ('inclusive','exclusive') then raise exception 'invalid_money'; end if;
  select * into s from public.stores where id=p_store;
  cust := (b->>'customerId')::uuid; item := (b->>'itemId')::uuid;
  if cust is not null then
    select * into c from public.customers where id=cust and store_id=p_store and organization_id=s.organization_id and archived_at is null for share;
    if not found or coalesce(nullif(c.company_name,''),c.name) is distinct from b->>'customerName' then raise exception 'customer_changed'; end if;
  end if;
  if item is not null then
    select * into i from public.items where id=item and store_id=p_store and organization_id=s.organization_id and archived_at is null and status='active' and availability='available' for share;
    if not found or i.name is distinct from subject or i.updated_at is distinct from (b->>'itemUpdatedAt')::timestamptz then raise exception 'item_changed'; end if;
  end if;
  amount := qty*price;
  tax := floor(amount*rate/(case inclusion when 'inclusive' then 100+rate else 100 end));
  subtotal := case inclusion when 'inclusive' then amount-tax else amount end;
  total := subtotal+tax; t10 := case when rate=10 then subtotal else 0 end; t8 := case when rate=8 then subtotal else 0 end;
  a := (v.state->>'generationId')::uuid;
  -- Draft numbers never consume the issued-document numbering sequence.
  num := (case k when 'estimates' then 'EST' else 'INV' end)||'-DRAFT-'||a::text;
  d := (now() at time zone 'Asia/Tokyo')::date;
  note := subject||' / 数量 '||qty||' / 単価 '||price||'円（'||case inclusion when 'inclusive' then '税込' else '税抜' end||'）'||E'\n'||p_note;
  if k='estimates' then
    insert into public.estimates(id,organization_id,store_id,customer_id,document_number,title,issue_date,status,subtotal,tax_total,total,tax_inclusion,tax_10_subtotal,tax_10_amount,tax_8_subtotal,tax_8_amount,notes)
      values(a,s.organization_id,p_store,cust,num,subject,d,'draft',subtotal,tax,total,inclusion,t10,case when rate=10 then tax else 0 end,t8,case when rate=8 then tax else 0 end,note);
  else
    insert into public.invoices(id,organization_id,store_id,customer_id,document_number,title,issue_date,status,subtotal,tax_total,total,tax_inclusion,tax_10_subtotal,tax_10_amount,tax_8_subtotal,tax_8_amount,notes,payment_status,stripe_payment_status,qualified_invoice_issuer_name)
      values(a,s.organization_id,p_store,cust,num,subject,d,'draft',subtotal,tax,total,inclusion,t10,case when rate=10 then tax else 0 end,t8,case when rate=8 then tax else 0 end,note,'unpaid','not_created',s.name);
  end if;
  -- No payment, sales transaction, PDF issuance, delivery or external publish is created.
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(s.organization_id,p_store,p_actor,'sales_conversation_drafted',case k when 'estimates' then 'estimate' else 'invoice' end,a,'会話から未発行の書類下書きを作成',jsonb_build_object('kind',k));
  update public.sales_conversations set state=(v.state-'lease'-'leaseUntil')||jsonb_build_object('step','done','actionId',a),revision=revision+1,updated_at=now()
    where store_id=p_store and user_id=p_actor;
  return a;
end; $$;
revoke all on function public.finish_sales_conversation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_sales_conversation(uuid,uuid,text,text) to service_role;
commit;
