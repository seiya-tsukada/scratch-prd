-- ========================================================
-- メンテナンス: idea_ws の全テーブルの行数（読み取りのみ）
--   psql "$DATABASE_URL_DIRECT" -f supabase/maintenance/row_counts.sql
-- ========================================================

\set ON_ERROR_STOP on

select
  t.table_name,
  (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from idea_ws.%I', t.table_name), false, true, '')))[1]::text::bigint as row_count
from information_schema.tables t
where t.table_schema = 'idea_ws' and t.table_type = 'BASE TABLE'
order by t.table_name;
