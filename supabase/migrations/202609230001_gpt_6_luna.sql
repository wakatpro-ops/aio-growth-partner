-- Only migrate the legacy application defaults. Preserve custom model routing
-- and historical generation/observation logs.
begin;

alter table public.ai_prompt_templates alter column model set default 'gpt-6-luna';
alter table public.sales_ai_reports alter column model_name set default 'gpt-6-luna';

update public.ai_prompt_templates
set model = 'gpt-6-luna', updated_at = now()
where model in ('gpt-4.1-mini', 'gpt-4o-mini');

commit;
