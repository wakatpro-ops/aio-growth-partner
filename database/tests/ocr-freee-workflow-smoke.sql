begin;

insert into public.expense_receipts (
  id, organization_id, store_id, original_file_name, file_sha256, content_fingerprint,
  vendor_name, receipt_date, total_amount, tax_amount, approval_status, freee_status,
  extracted_items, tax_breakdown
) values (
  '00000000-0000-4000-8000-000000009014',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000102',
  'smoke-receipt.pdf', 'smoke-file-14', 'smoke-content-14',
  'テスト商店', '2026-08-15', 1088, 88, 'approved', 'ready',
  '[{"name":"10%対象","amount":550,"tax_rate":"10","tax_amount":50},{"name":"8%対象","amount":538,"tax_rate":"8","tax_amount":38}]'::jsonb,
  '[{"rate":"10","amount":550,"tax_amount":50},{"rate":"8","amount":538,"tax_amount":38}]'::jsonb
);

select
  approval_status = 'approved' as approval_gate_ready,
  jsonb_array_length(extracted_items) = 2 as mixed_tax_items_preserved,
  jsonb_array_length(tax_breakdown) = 2 as mixed_tax_breakdown_preserved,
  file_sha256 is not null as duplicate_key_present
from public.expense_receipts
where id = '00000000-0000-4000-8000-000000009014';

rollback;
