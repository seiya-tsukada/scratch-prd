-- ========================================================
-- Idea Workspace: 権限と RLS
--   * idea_ws は Data API（PostgREST）の Exposed schemas に追加しない
--   * anon / authenticated / service_role / PUBLIC からは何も見えない・実行できない
--   * Python バックエンドは専用ロール idea_ws_app で接続する
--     （Supabase では自作ロールに BYPASSRLS を付けられないため、idea_ws_app 限定のポリシーで通す）
--   * idea_ws_app のログイン可否とパスワードはマイグレーションに含めない（docs/supabase-setup.md を参照）
--   * テーブルを追加するマイグレーションでは、同じく RLS 有効化・GRANT・idea_ws_app 用ポリシーを行うこと
-- ========================================================

-- --------------------------------------------------------
-- Supabase の既定ロールと PUBLIC からの剥奪
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

-- --------------------------------------------------------
-- アプリ用ロール
-- --------------------------------------------------------

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
  idea_ws.sessions,
  idea_ws.email_login_tokens,
  idea_ws.oauth_states,
  idea_ws.projects,
  idea_ws.sections,
  idea_ws.notes,
  idea_ws.prd_documents,
  idea_ws.prd_versions,
  idea_ws.workspace_preferences,
  idea_ws.events,
  idea_ws.ai_generations,
  idea_ws.api_usage,
  idea_ws.rate_limit_buckets
to idea_ws_app;

-- コンテンツ: 読み取りのみ（編集は postgres ロールで行う）
grant select on idea_ws.section_templates, idea_ws.sample_contents to idea_ws_app;

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
    execute format(
      'create policy idea_ws_app_all on idea_ws.%I for all to idea_ws_app using (true) with check (true)',
      t.relname
    );
  end loop;
end;
$$;
