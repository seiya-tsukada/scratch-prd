-- ========================================================
-- Idea Workspace: グロース計測の集計ビュー（Phase 6）
--   * SQL Editor（postgres ロール）から見る想定。anon / authenticated / service_role / idea_ws_app には権限を付けない
--   * security_invoker で、ビューを見るロールの権限でもとのテーブルを読む
--   * 日付は JST
-- ========================================================

-- ゲスト作成日ごとのコホート: その日に作られたゲストのうち、その後メモ作成 / PRD 生成 / 登録まで進んだ人数
create view idea_ws.funnel_daily with (security_invoker = true) as
with first_events as (
  select user_id, event_name, min(created_at) as first_at
  from idea_ws.events
  where user_id is not null
    and event_name in ('guest_created', 'note_created', 'prd_generated', 'signup_completed')
  group by user_id, event_name
),
cohort as (
  select user_id, (first_at at time zone 'Asia/Tokyo')::date as day
  from first_events
  where event_name = 'guest_created'
)
select
  c.day,
  count(*) as guests_created,
  count(*) filter (where n.user_id is not null) as created_note,
  count(*) filter (where p.user_id is not null) as generated_prd,
  count(*) filter (where s.user_id is not null) as signed_up
from cohort c
left join first_events n on n.user_id = c.user_id and n.event_name = 'note_created'
left join first_events p on p.user_id = c.user_id and p.event_name = 'prd_generated'
left join first_events s on s.user_id = c.user_id and s.event_name = 'signup_completed'
group by c.day
order by c.day;

-- AI 生成の日次件数とフォールバック率（理由別）
create view idea_ws.ai_fallback_daily with (security_invoker = true) as
select
  (created_at at time zone 'Asia/Tokyo')::date as day,
  kind,
  count(*) as total,
  count(*) filter (where used_fallback) as fallbacks,
  round(100.0 * count(*) filter (where used_fallback) / count(*), 1) as fallback_rate_pct,
  count(*) filter (where error_type = 'no_api_key') as no_api_key,
  count(*) filter (where error_type like 'ai_error%') as ai_errors,
  count(*) filter (where error_type = 'invalid_response') as invalid_responses,
  round(avg(latency_ms)) as avg_latency_ms
from idea_ws.ai_generations
group by 1, 2
order by 1, 2;

revoke all on idea_ws.funnel_daily, idea_ws.ai_fallback_daily from public, anon, authenticated, service_role;
