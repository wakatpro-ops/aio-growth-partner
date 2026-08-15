begin;

select
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_payment_transactions' and column_name = 'idempotency_key') as idempotency_ready,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_payment_transactions' and column_name = 'amount_refunded') as refund_state_ready,
  to_regclass('public.stripe_webhook_events') is not null as webhook_replay_log_ready,
  to_regclass('public.payment_receipts') is not null as receipt_ready,
  to_regclass('public.payment_receipt_issues') is not null as receipt_history_ready,
  exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_external_provider_id_uidx') as duplicate_payment_guard_ready,
  exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_receipts') as receipt_rls_ready;

rollback;
