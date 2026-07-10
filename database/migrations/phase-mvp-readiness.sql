insert into public.plans (key, name, description, is_active)
values
  ('free', 'Free', '無料検証向け。1店舗、少量AI生成、手動投稿支援を中心に利用します。', true),
  ('starter', 'Starter', '小規模店舗向け。3店舗、AI生成、CSV取込、PDF、Google支援を利用します。', true),
  ('pro', 'Pro', '複数店舗運用向け。店舗数、AI生成、CSV取込、レポート運用を拡張します。', true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('free', 'max_stores', '1'::jsonb),
  ('free', 'ai_generations_per_month', '20'::jsonb),
  ('free', 'csv_imports_per_month', '3'::jsonb),
  ('free', 'google_mode', '"manual_only"'::jsonb),
  ('starter', 'max_stores', '3'::jsonb),
  ('starter', 'ai_generations_per_month', '100'::jsonb),
  ('starter', 'csv_imports_per_month', '20'::jsonb),
  ('starter', 'google_mode', '"gmail_calendar_manual_gbp"'::jsonb),
  ('pro', 'max_stores', '10'::jsonb),
  ('pro', 'ai_generations_per_month', '500'::jsonb),
  ('pro', 'csv_imports_per_month', '100'::jsonb),
  ('pro', 'google_mode', '"gmail_calendar_manual_gbp"'::jsonb)
on conflict (plan_key, limit_key) do update set
  limit_value = excluded.limit_value,
  updated_at = now();

update public.stores
set profile_data = coalesce(profile_data, '{}'::jsonb) || '{"data_mode":"demo","is_demo":true}'::jsonb,
    updated_at = now()
where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);

update public.stores
set profile_data = coalesce(profile_data, '{}'::jsonb) || '{"data_mode":"production","is_demo":false}'::jsonb,
    updated_at = now()
where id not in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
)
and coalesce(profile_data ->> 'data_mode', '') = '';
