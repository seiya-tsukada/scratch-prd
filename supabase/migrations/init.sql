-- ========================================================
-- Idea Workspace: idea_ws スキーマ（テーブル・関数・ビュー・権限・RLS）
--   * 冪等: 何度実行しても同じ状態になる。既にあるオブジェクトは作らない（関数・ビュー・トリガーは置き換える）
--   * Supabase Auth（auth.users）は使わない。ユーザーは idea_ws.users で管理する
--   * public スキーマは使わない
--   * idea_ws は Data API（PostgREST）の Exposed schemas に追加しない
--   * idea_ws_app のログイン可否とパスワードは含めない（docs/supabase-setup.md を参照）
--   * PostgreSQL 14 以上（create or replace trigger）
--
-- 適用: psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/init.sql
-- 変更するとき: 既存の DB にも効くよう、冪等な文（add column if not exists、pg_constraint を見る do ブロックなど）で
--   このファイルに追記するか、名前順で後ろに来る新しいファイルを supabase/migrations/ に足す
-- ========================================================

-- 2 回目以降の「already exists, skipping」を表示しない
set client_min_messages = warning;

create extension if not exists citext with schema extensions;

create schema if not exists idea_ws;

-- updated_at の自動更新
create or replace function idea_ws.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------
-- ユーザー・認証
-- --------------------------------------------------------

create table if not exists idea_ws.users (
  id uuid primary key default gen_random_uuid(),
  is_guest boolean not null default true,
  email extensions.citext unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  -- 初回オンボーディングの状態（登録しても同じ行なので引き継がれる）
  onboarding_completed_at timestamptz,
  onboarding_result text check (onboarding_result in ('completed', 'skipped')),
  -- 正規ユーザーは必ずメールアドレスを持つ
  constraint users_registered_has_email check (is_guest or email is not null),
  constraint users_onboarding_consistent check ((onboarding_completed_at is null) = (onboarding_result is null))
);

create index if not exists users_guest_last_active_idx on idea_ws.users (last_active_at) where is_guest;

create table if not exists idea_ws.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  provider text not null check (provider in ('email', 'google', 'password')),
  provider_subject text not null,
  email extensions.citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create index if not exists user_identities_user_id_idx on idea_ws.user_identities (user_id);

-- パスワードは Argon2id のハッシュのみ保存する
create table if not exists idea_ws.password_credentials (
  user_id uuid primary key references idea_ws.users (id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- token_hash / ip_hash はサーバー側 pepper による HMAC-SHA256。平文は保存しない
create table if not exists idea_ws.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip_hash bytea
);

create index if not exists sessions_user_id_idx on idea_ws.sessions (user_id);
create index if not exists sessions_expires_at_idx on idea_ws.sessions (expires_at);

create table if not exists idea_ws.email_login_tokens (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  token_hash bytea not null unique,
  -- ゲストからの登録なら昇格先のユーザー
  requested_by_user_id uuid references idea_ws.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists email_login_tokens_expires_at_idx on idea_ws.email_login_tokens (expires_at);

-- state はハッシュで保存。code_verifier（PKCE）はコールバックで使うため保持し、短い有効期限で掃除する
create table if not exists idea_ws.oauth_states (
  state_hash bytea primary key,
  code_verifier text not null,
  requested_by_user_id uuid references idea_ws.users (id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists oauth_states_expires_at_idx on idea_ws.oauth_states (expires_at);

-- --------------------------------------------------------
-- ユーザーデータ（src/types/index.ts と対応）
--   * 子テーブルは (親id, user_id) の複合外部キーで親を参照し、所有者の一致を DB でも保証する
--   * ゲストのデータを既存アカウントに統合できるよう、複合外部キーに on update cascade を付ける
--     （projects.user_id を書き換えると、配下の notes / prds / versions / preferences / tags も付け替わる）
-- --------------------------------------------------------

create table if not exists idea_ws.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists projects_user_id_idx on idea_ws.projects (user_id, updated_at desc);

create table if not exists idea_ws.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  title text not null default '',
  content text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- note_tags から (id, project_id, user_id) で参照するため
  unique (id, project_id, user_id),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade on update cascade
);

create index if not exists notes_project_idx on idea_ws.notes (user_id, project_id, updated_at desc);

-- generation_mode の 'unknown' は旧データ（PRD セクションのメモ）から変換した PRD。AI の生成には使わない
create table if not exists idea_ws.prd_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  title text not null,
  content text not null default '',
  generation_mode text not null check (generation_mode in ('strict', 'suggest', 'expand', 'unknown')),
  detail_level text not null default 'standard' check (detail_level in ('brief', 'standard', 'detailed')),
  -- メモ削除後も参照履歴を残すため外部キーにしない
  source_note_ids uuid[] not null default '{}',
  facts jsonb not null default '[]',
  proposals jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  contradictions jsonb not null default '[]',
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade on update cascade
);

create index if not exists prd_documents_project_idx on idea_ws.prd_documents (user_id, project_id, updated_at desc);

-- 保存のたびに積まれる旧版のスナップショット
create table if not exists idea_ws.prd_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  prd_document_id uuid not null,
  version_number integer not null check (version_number >= 1),
  title text not null,
  content text not null,
  generation_mode text not null check (generation_mode in ('strict', 'suggest', 'expand', 'unknown')),
  detail_level text not null check (detail_level in ('brief', 'standard', 'detailed')),
  source_note_ids uuid[] not null default '{}',
  facts jsonb not null default '[]',
  proposals jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  contradictions jsonb not null default '[]',
  summary text,
  created_at timestamptz not null default now(),
  unique (prd_document_id, version_number),
  foreign key (prd_document_id, user_id)
    references idea_ws.prd_documents (id, user_id) on delete cascade on update cascade
);

create table if not exists idea_ws.workspace_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  pane_count smallint not null default 2 check (pane_count between 1 and 4),
  panes jsonb not null default '[]',
  active_pane_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade on update cascade
);

-- メモのタグ（プロジェクト単位。名前は大文字小文字を区別せずユニーク。色は任意）。PRD にはタグを付けない
create table if not exists idea_ws.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 50),
  -- 色は画面のパレットのキー（src/config/tags.ts / backend/app/config.py の TAG_COLORS）
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id, user_id),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade on update cascade
);

create unique index if not exists tags_project_name_idx on idea_ws.tags (user_id, project_id, lower(name));

-- メモとタグの多対多。タグやメモを消すと紐付けも消える
create table if not exists idea_ws.note_tags (
  note_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id),
  -- メモとタグは同じプロジェクト・同じユーザーのものに限る
  foreign key (note_id, project_id, user_id)
    references idea_ws.notes (id, project_id, user_id) on delete cascade on update cascade,
  foreign key (tag_id, project_id, user_id)
    references idea_ws.tags (id, project_id, user_id) on delete cascade on update cascade
);

-- タグからメモを引く（絞り込み・タグ削除時の cascade）
create index if not exists note_tags_tag_idx on idea_ws.note_tags (tag_id);

-- --------------------------------------------------------
-- コンテンツ（デプロイなしで初回体験を調整するためのデータ）
-- --------------------------------------------------------

-- 新規ゲストに複製するサンプル。content の形式は supabase/seed.sql の先頭コメントを参照
create table if not exists idea_ws.sample_contents (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  is_active boolean not null default false,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 有効なサンプルは常に 1 件まで
create unique index if not exists sample_contents_single_active_idx
  on idea_ws.sample_contents (is_active) where is_active;

-- --------------------------------------------------------
-- グロース計測
--   ゲスト掃除・アカウント削除後もファネルを集計できるよう、ユーザー削除時は user_id を NULL にする。
--   properties に個人情報やメモ本文を入れないこと
-- --------------------------------------------------------

create table if not exists idea_ws.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references idea_ws.users (id) on delete set null,
  session_id uuid references idea_ws.sessions (id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists events_name_created_idx on idea_ws.events (event_name, created_at);
create index if not exists events_user_idx on idea_ws.events (user_id);
create index if not exists events_session_idx on idea_ws.events (session_id);

create table if not exists idea_ws.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references idea_ws.users (id) on delete set null,
  kind text not null check (kind in ('structure', 'prd')),
  mode text,
  detail_level text,
  note_count integer,
  input_chars integer,
  latency_ms integer,
  used_fallback boolean not null default false,
  error_type text,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists ai_generations_created_idx on idea_ws.ai_generations (created_at);
create index if not exists ai_generations_user_idx on idea_ws.ai_generations (user_id);

-- 日次の AI 利用回数（usage_date は JST）。加算は idea_ws.consume_quota 経由で行う
create table if not exists idea_ws.api_usage (
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  usage_date date not null,
  kind text not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, usage_date, kind)
);

-- IP 単位などユーザーに紐づかないレート制限（固定ウィンドウ）。加算は idea_ws.consume_rate_limit 経由
--   key は '<種別>:<IP の HMAC ハッシュ>' などとし、生の IP を入れないこと
create table if not exists idea_ws.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);

create index if not exists rate_limit_buckets_window_idx on idea_ws.rate_limit_buckets (window_start);

-- --------------------------------------------------------
-- updated_at トリガー
-- --------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'user_identities', 'password_credentials', 'projects', 'notes', 'prd_documents',
    'workspace_preferences', 'tags', 'sample_contents'
  ]
  loop
    execute format(
      'create or replace trigger set_updated_at before update on idea_ws.%I
         for each row execute function idea_ws.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------
-- クォータ・レート制限・掃除用の関数（すべて SECURITY INVOKER。実行権限は idea_ws_app にのみ付与する）
-- --------------------------------------------------------

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

-- --------------------------------------------------------
-- グロース計測の集計ビュー
--   * SQL Editor（postgres ロール）から見る想定。anon / authenticated / service_role / idea_ws_app には権限を付けない
--   * security_invoker で、ビューを見るロールの権限でもとのテーブルを読む
--   * 日付は JST
-- --------------------------------------------------------

-- ゲスト作成日ごとのコホート: その日に作られたゲストのうち、その後メモ作成 / PRD 生成 / 登録まで進んだ人数
create or replace view idea_ws.funnel_daily with (security_invoker = true) as
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
create or replace view idea_ws.ai_fallback_daily with (security_invoker = true) as
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

-- --------------------------------------------------------
-- 権限
--   * anon / authenticated / service_role / PUBLIC からは何も見えない・実行できない
--   * Python バックエンドは専用ロール idea_ws_app で接続する
--     （Supabase では自作ロールに BYPASSRLS を付けられないため、idea_ws_app 限定のポリシーで通す）
-- --------------------------------------------------------

revoke all on schema idea_ws from public, anon, authenticated, service_role;
revoke all on all tables in schema idea_ws from public, anon, authenticated, service_role;
revoke all on all sequences in schema idea_ws from public, anon, authenticated, service_role;
revoke all on all functions in schema idea_ws from public, anon, authenticated, service_role;

-- 今後 postgres が作るオブジェクトにも既定の権限を付けない
alter default privileges for role postgres in schema idea_ws
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema idea_ws
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema idea_ws
  revoke all on functions from public, anon, authenticated, service_role;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'idea_ws_app') then
    create role idea_ws_app nologin noinherit;
  end if;
end;
$$;

-- citext の演算子（大文字小文字を区別しない比較）を解決するため extensions も検索パスに含める
alter role idea_ws_app set search_path = idea_ws, extensions;

grant usage on schema idea_ws to idea_ws_app;
grant usage on schema extensions to idea_ws_app;

-- ユーザー・認証・ユーザーデータ・計測: 読み書き
grant select, insert, update, delete on
  idea_ws.users,
  idea_ws.user_identities,
  idea_ws.password_credentials,
  idea_ws.sessions,
  idea_ws.email_login_tokens,
  idea_ws.oauth_states,
  idea_ws.projects,
  idea_ws.notes,
  idea_ws.prd_documents,
  idea_ws.prd_versions,
  idea_ws.workspace_preferences,
  idea_ws.tags,
  idea_ws.note_tags,
  idea_ws.events,
  idea_ws.ai_generations,
  idea_ws.api_usage,
  idea_ws.rate_limit_buckets
to idea_ws_app;

-- コンテンツ: 読み取りのみ（編集は postgres ロールで行う）
grant select on idea_ws.sample_contents to idea_ws_app;

grant execute on function
  idea_ws.consume_quota(uuid, text, integer),
  idea_ws.consume_rate_limit(text, integer, integer),
  idea_ws.cleanup_inactive_guests(integer),
  idea_ws.cleanup_expired_auth(interval)
to idea_ws_app;

-- --------------------------------------------------------
-- RLS: 全テーブルで有効化。ポリシーは idea_ws_app 向けのみ（anon / authenticated 向けは作らない）
--   行レベルの認可（user_id 条件）は Python 側で行う
-- --------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'idea_ws' and c.relkind = 'r'
  loop
    execute format('alter table idea_ws.%I enable row level security', t.relname);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'idea_ws' and tablename = t.relname and policyname = 'idea_ws_app_all'
    ) then
      execute format(
        'create policy idea_ws_app_all on idea_ws.%I for all to idea_ws_app using (true) with check (true)',
        t.relname
      );
    end if;
  end loop;
end;
$$;
