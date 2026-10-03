-- Issue #168: preserve evidence and apply an approved clarification atomically.
alter table public.unified_import_rows add column if not exists clarification_base_data jsonb;
revoke select, insert, update, delete on public.unified_import_jobs, public.unified_import_rows from anon, authenticated;
drop policy if exists "write org unified import jobs" on public.unified_import_jobs;
drop policy if exists "write org unified import rows" on public.unified_import_rows;

create or replace function public.guard_unified_import_evidence() returns trigger
language plpgsql set search_path = public as $$
declare i integer;
begin
  if tg_table_name = 'unified_import_rows' then
    if (new.import_job_id,new.organization_id,new.store_id,new.sheet_name,new.row_number,new.raw_data)
       is distinct from (old.import_job_id,old.organization_id,old.store_id,old.sheet_name,old.row_number,old.raw_data) then
      raise exception 'Original import evidence cannot be changed';
    end if;
    if old.clarification_base_data is not null and new.clarification_base_data is distinct from old.clarification_base_data then
      raise exception 'Original normalized snapshot cannot be changed';
    end if;
    if (old.review_status = 'imported' or old.result_id is not null) and
      (new.normalized_data,new.review_status,new.confirmed_record_type,new.result_id,new.result_table)
      is distinct from (old.normalized_data,old.review_status,old.confirmed_record_type,old.result_id,old.result_table) then
      raise exception 'Already imported rows cannot be changed';
    end if;
  else
    if (new.organization_id,new.store_id,new.storage_bucket,new.storage_path,new.file_sha256,new.original_filename)
       is distinct from (old.organization_id,old.store_id,old.storage_bucket,old.storage_path,old.file_sha256,old.original_filename) then
      raise exception 'Original file evidence cannot be changed';
    end if;
    if old.status in ('analyzing','importing') and new.archived_at is distinct from old.archived_at then
      raise exception 'An active import cannot be archived';
    end if;
    for i in 0..coalesce(jsonb_array_length(old.answers->'clarification_resolutions'),0)-1 loop
      if new.answers->'clarification_resolutions'->i is distinct from old.answers->'clarification_resolutions'->i then
        raise exception 'Approved answer history cannot be changed';
      end if;
    end loop;
    if not coalesce(new.answers->'clarification_original_sheets','{}') @> coalesce(old.answers->'clarification_original_sheets','{}') then
      raise exception 'Original table metadata cannot be changed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_unified_import_evidence on public.unified_import_rows;
create trigger guard_unified_import_evidence before update on public.unified_import_rows for each row execute function public.guard_unified_import_evidence();
drop trigger if exists guard_unified_import_evidence on public.unified_import_jobs;
create trigger guard_unified_import_evidence before update on public.unified_import_jobs for each row execute function public.guard_unified_import_evidence();

create or replace function public.apply_unified_import_clarification(
  p_job_id uuid, p_store_id uuid, p_organization_id uuid,
  p_expected_revision timestamptz, p_revision timestamptz,
  p_rows jsonb, p_answers jsonb, p_sheets jsonb, p_questions jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare job public.unified_import_jobs; r jsonb; existing public.unified_import_rows;
begin
  select * into job from public.unified_import_jobs where id=p_job_id and store_id=p_store_id and organization_id=p_organization_id for update;
  if not found or job.archived_at is not null or job.updated_at is distinct from p_expected_revision or job.status not in ('questions_required','review_required','review_ready') or p_revision is null or p_revision<=job.updated_at then
    raise exception 'Import revision or state changed';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) v where coalesce(job.answers->'execution_started_tables','[]') ? (v->>'sheet_name')) then raise exception 'Table has started importing'; end if;
  -- Prune only obsolete, unposted derived adjustments BEFORE reusing their
  -- virtual row position. Originals and the append-only answer history remain.
  delete from public.unified_import_rows old_adjustment
    where old_adjustment.import_job_id=job.id and old_adjustment.normalized_data->>'clarification_adjustment'='true'
      and old_adjustment.result_id is null and old_adjustment.review_status not in ('imported','error')
      and old_adjustment.sheet_name in (select value->>'sheet_name' from jsonb_array_elements(p_rows))
      and not exists(select 1 from jsonb_array_elements(p_rows) v where (v->>'id')::uuid=old_adjustment.id);
  for r in select value from jsonb_array_elements(p_rows) loop
    if coalesce(job.answers->'execution_started_tables','[]') ? (r->>'sheet_name') then raise exception 'Table has started importing'; end if;
    select * into existing from public.unified_import_rows where id=(r->>'id')::uuid;
    if found then
      if existing.import_job_id<>job.id or existing.store_id<>job.store_id or existing.organization_id<>job.organization_id or existing.sheet_name<>r->>'sheet_name' or existing.row_number<>(r->>'row_number')::integer or existing.review_status in ('imported','error') or existing.result_id is not null then raise exception 'Row evidence or state changed'; end if;
      update public.unified_import_rows set clarification_base_data=coalesce(clarification_base_data,normalized_data),
        normalized_data=r->'normalized_data', missing_fields=array(select jsonb_array_elements_text(r->'missing_fields')),
        question=r->>'question', review_status=r->>'review_status', confirmed_record_type=r->>'confirmed_record_type', updated_at=p_revision where id=existing.id;
    else
      if coalesce((r->'normalized_data'->>'clarification_adjustment')::boolean,false) is not true then raise exception 'Only an approved adjustment may add a row'; end if;
      insert into public.unified_import_rows(id,import_job_id,organization_id,store_id,sheet_name,row_number,raw_data,normalized_data,suggested_record_type,confirmed_record_type,confidence,missing_fields,question,review_status,updated_at)
      values((r->>'id')::uuid,job.id,job.organization_id,job.store_id,r->>'sheet_name',(r->>'row_number')::integer,r->'raw_data',r->'normalized_data',r->>'suggested_record_type',r->>'confirmed_record_type',(r->>'confidence')::numeric,array(select jsonb_array_elements_text(r->'missing_fields')),r->>'question',r->>'review_status',p_revision);
    end if;
  end loop;
  update public.unified_import_jobs set answers=p_answers,sheet_summaries=p_sheets,questions=p_questions,
    status=case when jsonb_array_length(p_questions)>0 then 'questions_required' else 'review_required' end,
    total_rows=(select count(*) from public.unified_import_rows where import_job_id=job.id),
    approved_rows=0, completed_at=null, updated_at=p_revision where id=job.id;
end $$;
revoke all on function public.apply_unified_import_clarification(uuid,uuid,uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_unified_import_clarification(uuid,uuid,uuid,timestamptz,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;
