-- ========================================================
-- メンテナンス: サンプル（sample_contents）以外の idea_ws の全テーブルを空にする（取り消せない）
--   スキーマ・権限・サンプルは残るので、そのまま新しいゲストを作れる
--   誤って本番のデータを消さないよう、-v confirm=yes が無ければ何もせずに止まる
--   psql "$DATABASE_URL_DIRECT" -v confirm=yes -f supabase/maintenance/truncate_data.sql
-- ========================================================

\set ON_ERROR_STOP on

\if :{?confirm}
\else
  \set confirm ''
\endif
select :'confirm' = 'yes' as confirmed \gset

\if :confirmed
  do $$
  declare
    v_tables text;
  begin
    select string_agg(format('idea_ws.%I', tablename), ', ' order by tablename)
    into v_tables
    from pg_tables
    where schemaname = 'idea_ws' and tablename <> 'sample_contents';

    if v_tables is not null then
      execute 'truncate table ' || v_tables;
      raise notice 'truncated: %', v_tables;
    end if;
  end;
  $$;
\else
  \echo 'サンプル以外の全データを消します。実行するには -v confirm=yes を付けてください'
  do $$ begin raise exception 'confirmation required (-v confirm=yes)'; end $$;
\endif
