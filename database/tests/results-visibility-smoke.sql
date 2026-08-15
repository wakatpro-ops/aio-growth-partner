begin;

select plan(9);

select has_table('public', 'search_visibility_settings', 'results settings table exists');
select has_table('public', 'search_visibility_keywords', 'results keywords table exists');
select has_table('public', 'search_visibility_snapshots', 'results snapshots table exists');
select col_is_unique('public', 'search_visibility_settings', 'store_id', 'one settings row per store');
select has_column('public', 'search_visibility_keywords', 'archived_at', 'keywords are recoverably archived');
select has_column('public', 'search_visibility_snapshots', 'average_position', 'average position is stored');
select has_column('public', 'search_visibility_snapshots', 'period_kind', 'baseline and current are separated');
select has_index('public', 'search_visibility_keywords_active_unique_idx', 'active keywords are unique');
select has_index('public', 'search_visibility_snapshots_store_idx', 'snapshot history is indexed');

select * from finish();
rollback;
