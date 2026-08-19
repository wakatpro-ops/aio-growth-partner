-- Issue #35: enforce results authorization at the DB boundary, including parent IDs.

create or replace function public.is_org_editor(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    join public.user_profiles profile on profile.user_id = member.user_id
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.role_key in ('org_owner', 'store_manager', 'staff')
      and member.status = 'active'
      and member.archived_at is null
      and organization.status = 'active'
      and organization.archived_at is null
      and profile.status = 'active'
      and profile.archived_at is null
  );
$$;

drop policy if exists "write org search visibility settings" on public.search_visibility_settings;
drop policy if exists "write org search visibility keywords" on public.search_visibility_keywords;
drop policy if exists "write org search visibility snapshots" on public.search_visibility_snapshots;
drop policy if exists "write org ai visibility questions" on public.ai_visibility_questions;
drop policy if exists "write org ai visibility observations" on public.ai_visibility_observations;

create policy "write editors search visibility settings" on public.search_visibility_settings for all
using (public.is_org_editor(organization_id) or public.is_platform_admin())
with check (public.is_org_editor(organization_id) or public.is_platform_admin());
create policy "write editors search visibility keywords" on public.search_visibility_keywords for all
using (public.is_org_editor(organization_id) or public.is_platform_admin())
with check (public.is_org_editor(organization_id) or public.is_platform_admin());
create policy "write editors search visibility snapshots" on public.search_visibility_snapshots for all
using (public.is_org_editor(organization_id) or public.is_platform_admin())
with check (public.is_org_editor(organization_id) or public.is_platform_admin());
create policy "write editors ai visibility questions" on public.ai_visibility_questions for all
using (public.is_org_editor(organization_id) or public.is_platform_admin())
with check (public.is_org_editor(organization_id) or public.is_platform_admin());
create policy "write editors ai visibility observations" on public.ai_visibility_observations for all
using (public.is_org_editor(organization_id) or public.is_platform_admin())
with check (public.is_org_editor(organization_id) or public.is_platform_admin());

alter table public.stores
  drop constraint if exists stores_id_organization_id_key,
  add constraint stores_id_organization_id_key unique (id, organization_id);
alter table public.search_visibility_keywords
  drop constraint if exists search_visibility_keywords_id_store_org_key,
  add constraint search_visibility_keywords_id_store_org_key unique (id, store_id, organization_id);
alter table public.ai_visibility_questions
  drop constraint if exists ai_visibility_questions_id_store_org_key,
  add constraint ai_visibility_questions_id_store_org_key unique (id, store_id, organization_id);

alter table public.search_visibility_settings
  drop constraint if exists search_visibility_settings_store_org_fkey,
  add constraint search_visibility_settings_store_org_fkey
    foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete cascade;
alter table public.search_visibility_keywords
  drop constraint if exists search_visibility_keywords_store_org_fkey,
  add constraint search_visibility_keywords_store_org_fkey
    foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete cascade;
alter table public.search_visibility_snapshots
  drop constraint if exists search_visibility_snapshots_store_org_fkey,
  add constraint search_visibility_snapshots_store_org_fkey
    foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete cascade,
  drop constraint if exists search_visibility_snapshots_keyword_store_org_fkey,
  add constraint search_visibility_snapshots_keyword_store_org_fkey
    foreign key (keyword_id, store_id, organization_id)
    references public.search_visibility_keywords(id, store_id, organization_id) on delete restrict;
alter table public.ai_visibility_questions
  drop constraint if exists ai_visibility_questions_store_org_fkey,
  add constraint ai_visibility_questions_store_org_fkey
    foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete cascade;
alter table public.ai_visibility_observations
  drop constraint if exists ai_visibility_observations_store_org_fkey,
  add constraint ai_visibility_observations_store_org_fkey
    foreign key (store_id, organization_id) references public.stores(id, organization_id) on delete cascade,
  drop constraint if exists ai_visibility_observations_question_store_org_fkey,
  add constraint ai_visibility_observations_question_store_org_fkey
    foreign key (question_id, store_id, organization_id)
    references public.ai_visibility_questions(id, store_id, organization_id) on delete restrict;
