-- ========================================================
-- メンテナンス: メールアドレスを指定してユーザーを 1 人削除する
--   配下のデータ（セッション・プロジェクト・メモ・PRD・タグなど）は外部キーの on delete cascade で一緒に消える。
--   計測（events / ai_generations）は user_id が NULL になって残る
--   psql "$DATABASE_URL_DIRECT" -v email=user@example.com -f supabase/maintenance/delete_user.sql
-- ========================================================

\set ON_ERROR_STOP on

\if :{?email}
  -- email は citext のため大文字小文字を区別しない
  delete from idea_ws.users where email = :'email' returning id, email, created_at;
\else
  \echo '削除するユーザーのメールアドレスを -v email=... で指定してください'
  do $$ begin raise exception 'email required (-v email=...)'; end $$;
\endif
