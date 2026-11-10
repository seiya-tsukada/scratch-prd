-- ========================================================
-- メンテナンス: idea_ws スキーマを丸ごと削除する（テーブル・関数・ビュー・データ。取り消せない）
--   アプリ用ロール idea_ws_app はクラスタ全体のオブジェクトなので残る（パスワードもそのまま）
--   誤って本番のデータを消さないよう、-v confirm=yes が無ければ何もせずに止まる
--
--   作り直す（削除 → マイグレーション → seed を 1 トランザクションで）:
--   cat supabase/maintenance/drop_schema.sql supabase/migrations/*.sql supabase/seed.sql \
--     | psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -v confirm=yes -1
-- ========================================================

\set ON_ERROR_STOP on

\if :{?confirm}
\else
  \set confirm ''
\endif
select :'confirm' = 'yes' as confirmed \gset

\if :confirmed
  drop schema if exists idea_ws cascade;
\else
  \echo 'idea_ws スキーマを削除します。実行するには -v confirm=yes を付けてください'
  do $$ begin raise exception 'confirmation required (-v confirm=yes)'; end $$;
\endif
