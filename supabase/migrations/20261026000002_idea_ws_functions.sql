-- ========================================================
-- Idea Workspace: クォータ・レート制限・掃除用の関数
--   すべて SECURITY INVOKER。実行権限は 20261026000003_idea_ws_privileges.sql で idea_ws_app にのみ付与する
-- ========================================================

-- 日次クォータ（日付は JST）を上限判定つきでアトミックに 1 加算する。
-- 加算できたら true、上限に達していたら false（加算しない）
create or replace function idea_ws.consume_quota(p_user_id uuid, p_kind text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_consumed boolean;
begin
  if p_limit <= 0 then
    return false;
  end if;

  insert into idea_ws.api_usage as u (user_id, usage_date, kind, count)
  values (p_user_id, (now() at time zone 'Asia/Tokyo')::date, p_kind, 1)
  on conflict (user_id, usage_date, kind)
    do update set count = u.count + 1
    where u.count < p_limit
  returning true into v_consumed;

  return coalesce(v_consumed, false);
end;
$$;

-- 固定ウィンドウのレート制限を上限判定つきでアトミックに 1 加算する。
-- 加算できたら true、ウィンドウ内の上限に達していたら false（加算しない）
create or replace function idea_ws.consume_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_consumed boolean;
begin
  if p_limit <= 0 then
    return false;
  end if;
  if p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be positive';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into idea_ws.rate_limit_buckets as b (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
    do update set count = b.count + 1
    where b.count < p_limit
  returning true into v_consumed;

  return coalesce(v_consumed, false);
end;
$$;

-- 有効なセッションが残っておらず、p_inactive_days 日以上アクセスのないゲストを削除する。
-- そのようなゲストのデータには誰もアクセスできないため、データの有無は問わない。
-- 削除したユーザー数を返す
create or replace function idea_ws.cleanup_inactive_guests(p_inactive_days integer default 30)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from idea_ws.users u
  where u.is_guest
    and u.last_active_at < now() - make_interval(days => p_inactive_days)
    and not exists (
      select 1
      from idea_ws.sessions s
      where s.user_id = u.id
        and s.revoked_at is null
        and s.expires_at > now()
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- 期限切れ・失効済みのセッション、使用済み・期限切れのログイン用トークン、古いレート制限バケットを削除する
create or replace function idea_ws.cleanup_expired_auth(p_rate_limit_retention interval default interval '2 days')
returns table (
  sessions_deleted integer,
  email_login_tokens_deleted integer,
  oauth_states_deleted integer,
  rate_limit_buckets_deleted integer
)
language plpgsql
set search_path = ''
as $$
begin
  delete from idea_ws.sessions
  where expires_at <= now() or revoked_at is not null;
  get diagnostics sessions_deleted = row_count;

  delete from idea_ws.email_login_tokens
  where expires_at <= now() or used_at is not null;
  get diagnostics email_login_tokens_deleted = row_count;

  delete from idea_ws.oauth_states
  where expires_at <= now();
  get diagnostics oauth_states_deleted = row_count;

  delete from idea_ws.rate_limit_buckets
  where window_start < now() - p_rate_limit_retention;
  get diagnostics rate_limit_buckets_deleted = row_count;

  return next;
end;
$$;
