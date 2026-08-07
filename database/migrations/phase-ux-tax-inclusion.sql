alter table public.estimates add column if not exists tax_inclusion text not null default 'inclusive';
alter table public.invoices add column if not exists tax_inclusion text not null default 'inclusive';

alter table public.estimates drop constraint if exists estimates_tax_inclusion_check;
alter table public.estimates add constraint estimates_tax_inclusion_check check (tax_inclusion in ('inclusive', 'exclusive'));

alter table public.invoices drop constraint if exists invoices_tax_inclusion_check;
alter table public.invoices add constraint invoices_tax_inclusion_check check (tax_inclusion in ('inclusive', 'exclusive'));

comment on column public.estimates.tax_inclusion is 'inclusive=税込（内税）, exclusive=税抜（外税）';
comment on column public.invoices.tax_inclusion is 'inclusive=税込（内税）, exclusive=税抜（外税）';
