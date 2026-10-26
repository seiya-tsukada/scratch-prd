-- ========================================================
-- Idea Workspace: idea_ws スキーマとテーブル
--   * Supabase Auth（auth.users）は使わない。ユーザーは idea_ws.users で管理する
--   * public スキーマは使わない
--   * 権限・RLS は 20261026000003_idea_ws_privileges.sql
-- ========================================================

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

create table idea_ws.users (
  id uuid primary key default gen_random_uuid(),
  is_guest boolean not null default true,
  email extensions.citext unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  -- 正規ユーザーは必ずメールアドレスを持つ
  constraint users_registered_has_email check (is_guest or email is not null)
);

create index users_guest_last_active_idx on idea_ws.users (last_active_at) where is_guest;

create table idea_ws.user_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  provider text not null check (provider in ('email', 'google')),
  provider_subject text not null,
  email extensions.citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create index user_identities_user_id_idx on idea_ws.user_identities (user_id);

-- token_hash / ip_hash はサーバー側 pepper による HMAC-SHA256。平文は保存しない
create table idea_ws.sessions (
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

create index sessions_user_id_idx on idea_ws.sessions (user_id);
create index sessions_expires_at_idx on idea_ws.sessions (expires_at);

create table idea_ws.email_login_tokens (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  token_hash bytea not null unique,
  -- ゲストからの登録なら昇格先のユーザー
  requested_by_user_id uuid references idea_ws.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index email_login_tokens_expires_at_idx on idea_ws.email_login_tokens (expires_at);

-- state はハッシュで保存。code_verifier（PKCE）はコールバックで使うため保持し、短い有効期限で掃除する
create table idea_ws.oauth_states (
  state_hash bytea primary key,
  code_verifier text not null,
  requested_by_user_id uuid references idea_ws.users (id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index oauth_states_expires_at_idx on idea_ws.oauth_states (expires_at);

-- --------------------------------------------------------
-- ユーザーデータ（src/types/index.ts と対応）
--   子テーブルは (親id, user_id) の複合外部キーで親を参照し、所有者の一致を DB でも保証する
-- --------------------------------------------------------

create table idea_ws.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index projects_user_id_idx on idea_ws.projects (user_id, updated_at desc);

create table idea_ws.sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  name text not null,
  icon text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id, user_id),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade
);

create index sections_project_idx on idea_ws.sections (user_id, project_id, position);

create table idea_ws.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  section_id uuid not null,
  title text not null default '',
  content text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade,
  -- メモのセクションは同じプロジェクト・同じユーザーのものに限る
  foreign key (section_id, project_id, user_id)
    references idea_ws.sections (id, project_id, user_id) on delete cascade
);

create index notes_project_idx on idea_ws.notes (user_id, project_id, updated_at desc);
create index notes_section_idx on idea_ws.notes (section_id);

create table idea_ws.prd_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  title text not null,
  content text not null default '',
  generation_mode text not null check (generation_mode in ('strict', 'suggest', 'expand')),
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
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade
);

create index prd_documents_project_idx on idea_ws.prd_documents (user_id, project_id, updated_at desc);

-- 保存のたびに積まれる旧版のスナップショット
create table idea_ws.prd_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  prd_document_id uuid not null,
  version_number integer not null check (version_number >= 1),
  title text not null,
  content text not null,
  generation_mode text not null check (generation_mode in ('strict', 'suggest', 'expand')),
  detail_level text not null check (detail_level in ('brief', 'standard', 'detailed')),
  source_note_ids uuid[] not null default '{}',
  facts jsonb not null default '[]',
  proposals jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  contradictions jsonb not null default '[]',
  summary text,
  created_at timestamptz not null default now(),
  unique (prd_document_id, version_number),
  foreign key (prd_document_id, user_id) references idea_ws.prd_documents (id, user_id) on delete cascade
);

create table idea_ws.workspace_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  project_id uuid not null,
  pane_count smallint not null default 2 check (pane_count between 1 and 4),
  panes jsonb not null default '[]',
  active_pane_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id),
  foreign key (project_id, user_id) references idea_ws.projects (id, user_id) on delete cascade
);

-- --------------------------------------------------------
-- コンテンツ（デプロイなしで初回体験を調整するためのデータ）
-- --------------------------------------------------------

-- 新規プロジェクト作成時に作るセクション
create table idea_ws.section_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  position integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 新規ゲストに複製するサンプル。content の形式は supabase/seed.sql の先頭コメントを参照
create table idea_ws.sample_contents (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  is_active boolean not null default false,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 有効なサンプルは常に 1 件まで
create unique index sample_contents_single_active_idx on idea_ws.sample_contents (is_active) where is_active;

-- --------------------------------------------------------
-- グロース計測
--   ゲスト掃除・アカウント削除後もファネルを集計できるよう、ユーザー削除時は user_id を NULL にする。
--   properties に個人情報やメモ本文を入れないこと
-- --------------------------------------------------------

create table idea_ws.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references idea_ws.users (id) on delete set null,
  session_id uuid references idea_ws.sessions (id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index events_name_created_idx on idea_ws.events (event_name, created_at);
create index events_user_idx on idea_ws.events (user_id);
create index events_session_idx on idea_ws.events (session_id);

create table idea_ws.ai_generations (
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

create index ai_generations_created_idx on idea_ws.ai_generations (created_at);
create index ai_generations_user_idx on idea_ws.ai_generations (user_id);

-- 日次の AI 利用回数（usage_date は JST）。加算は idea_ws.consume_quota 経由で行う
create table idea_ws.api_usage (
  user_id uuid not null references idea_ws.users (id) on delete cascade,
  usage_date date not null,
  kind text not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, usage_date, kind)
);

-- IP 単位などユーザーに紐づかないレート制限（固定ウィンドウ）。加算は idea_ws.consume_rate_limit 経由
--   key は '<種別>:<IP の HMAC ハッシュ>' などとし、生の IP を入れないこと
create table idea_ws.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);

create index rate_limit_buckets_window_idx on idea_ws.rate_limit_buckets (window_start);

-- --------------------------------------------------------
-- updated_at トリガー
-- --------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'user_identities', 'projects', 'sections', 'notes', 'prd_documents',
    'workspace_preferences', 'section_templates', 'sample_contents'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on idea_ws.%I
         for each row execute function idea_ws.set_updated_at()',
      t
    );
  end loop;
end;
$$;
