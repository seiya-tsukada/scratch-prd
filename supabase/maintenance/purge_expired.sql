-- ========================================================
-- メンテナンス: 期限切れ・失効済みのセッション、使用済み・期限切れのログイン用トークン、古いレート制限の記録を削除する
--   定期処理（GET /api/cron/cleanup）と同じ関数を呼ぶ。手動で急いで掃除したいときに使う
--   psql "$DATABASE_URL_DIRECT" -f supabase/maintenance/purge_expired.sql
-- ========================================================

\set ON_ERROR_STOP on

select * from idea_ws.cleanup_expired_auth();
