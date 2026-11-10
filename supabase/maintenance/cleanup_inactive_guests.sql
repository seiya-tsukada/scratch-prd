-- ========================================================
-- メンテナンス: 有効なセッションが無く、一定日数アクセスの無いゲストを削除する（配下のデータも消える）
--   定期処理（GET /api/cron/cleanup）と同じ関数を呼ぶ。日数の既定は 30
--   psql "$DATABASE_URL_DIRECT" -f supabase/maintenance/cleanup_inactive_guests.sql
--   psql "$DATABASE_URL_DIRECT" -v days=7 -f supabase/maintenance/cleanup_inactive_guests.sql
-- ========================================================

\set ON_ERROR_STOP on

\if :{?days}
\else
  \set days 30
\endif

select idea_ws.cleanup_inactive_guests(:'days'::integer) as guests_deleted;
