-- ========================================================
-- メンテナンス: 全ユーザーとそのデータを消す（取り消せない）
--   users を参照するテーブル（認証・ユーザーデータ・計測を含む）も TRUNCATE ... CASCADE で空になる。
--   サンプル（sample_contents）とレート制限（rate_limit_buckets）は残る
--   誤って本番のデータを消さないよう、-v confirm=yes が無ければ何もせずに止まる
--   psql "$DATABASE_URL_DIRECT" -v confirm=yes -f supabase/maintenance/truncate_users.sql
-- ========================================================

\set ON_ERROR_STOP on

\if :{?confirm}
\else
  \set confirm ''
\endif
select :'confirm' = 'yes' as confirmed \gset

\if :confirmed
  begin;
  select count(*) as users_before from scratch_prd.users;
  truncate table scratch_prd.users cascade;
  select count(*) as users_after from scratch_prd.users;
  commit;
\else
  \echo '全ユーザーのデータを消します。実行するには -v confirm=yes を付けてください'
  do $$ begin raise exception 'confirmation required (-v confirm=yes)'; end $$;
\endif
