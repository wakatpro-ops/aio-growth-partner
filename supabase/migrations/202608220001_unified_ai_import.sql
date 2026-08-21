-- Issue #40: unified AI-assisted import with human review.
create table if not exists public.unified_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  original_filename text not null,
  storage_bucket text not null default 'import-files',
  storage_path text not null,
  file_sha256 text not null,
  file_type text not null,
  mime_type text,
  file_size bigint not null default 0,
  macro_enabled boolean not null default false,
  status text not null default 'analyzing',
  sheet_summaries jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  approved_rows integer not null default 0,
  success_rows integer not null default 0,
  error_rows integer not null default 0,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  constraint unified_import_jobs_status_check check (status in ('analyzing','questions_required','review_required','review_ready','importing','completed','partial_failed','failed')),
  unique (id, organization_id, store_id)
);

create table if not exists public.unified_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  sheet_name text not null,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  suggested_record_type text not null default 'unknown',
  confidence numeric(5,4) not null default 0,
  normalized_data jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  question text,
  review_status text not null default 'question',
  confirmed_record_type text,
  user_corrections jsonb not null default '{}'::jsonb,
  result_table text,
  result_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unified_import_rows_suggested_type_check check (suggested_record_type in ('sale','expense','customer','item','inventory','unknown','ignore')),
  constraint unified_import_rows_confirmed_type_check check (confirmed_record_type is null or confirmed_record_type in ('sale','expense','customer','item','inventory','unknown','ignore')),
  constraint unified_import_rows_review_status_check check (review_status in ('ready','question','ignored','approved','imported','error')),
  constraint unified_import_rows_job_parent_fk foreign key (import_job_id, organization_id, store_id) references public.unified_import_jobs(id, organization_id, store_id) on delete cascade,
  unique (import_job_id, sheet_name, row_number)
);

create unique index if not exists unified_import_jobs_store_file_active_uidx
  on public.unified_import_jobs(store_id, file_sha256)
  where archived_at is null;
create index if not exists unified_import_jobs_store_created_idx
  on public.unified_import_jobs(store_id, created_at desc)
  where archived_at is null;
create index if not exists unified_import_rows_job_status_idx
  on public.unified_import_rows(import_job_id, review_status, sheet_name, row_number);
create index if not exists unified_import_rows_store_type_idx
  on public.unified_import_rows(store_id, confirmed_record_type, review_status);

alter table public.unified_import_jobs enable row level security;
alter table public.unified_import_rows enable row level security;

drop policy if exists "read org unified import jobs" on public.unified_import_jobs;
drop policy if exists "write org unified import jobs" on public.unified_import_jobs;
drop policy if exists "read org unified import rows" on public.unified_import_rows;
drop policy if exists "write org unified import rows" on public.unified_import_rows;

create policy "read org unified import jobs" on public.unified_import_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org unified import jobs" on public.unified_import_jobs
for all using (
  public.is_platform_admin() or (
    public.is_org_editor(organization_id)
    and exists (select 1 from public.stores where stores.id = unified_import_jobs.store_id and stores.organization_id = unified_import_jobs.organization_id and stores.archived_at is null)
  )
)
with check (
  public.is_platform_admin() or (
    public.is_org_editor(organization_id)
    and exists (select 1 from public.stores where stores.id = unified_import_jobs.store_id and stores.organization_id = unified_import_jobs.organization_id and stores.archived_at is null)
  )
);

create policy "read org unified import rows" on public.unified_import_rows
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org unified import rows" on public.unified_import_rows
for all using (
  public.is_platform_admin() or (
    public.is_org_editor(organization_id)
    and exists (select 1 from public.unified_import_jobs jobs where jobs.id = unified_import_rows.import_job_id and jobs.organization_id = unified_import_rows.organization_id and jobs.store_id = unified_import_rows.store_id)
  )
)
with check (
  public.is_platform_admin() or (
    public.is_org_editor(organization_id)
    and exists (select 1 from public.unified_import_jobs jobs where jobs.id = unified_import_rows.import_job_id and jobs.organization_id = unified_import_rows.organization_id and jobs.store_id = unified_import_rows.store_id)
  )
);
