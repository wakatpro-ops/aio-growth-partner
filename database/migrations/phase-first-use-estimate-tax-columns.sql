alter table public.estimates add column if not exists tax_10_subtotal numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_10_amount numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_8_subtotal numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_8_amount numeric(12,2) default 0;
