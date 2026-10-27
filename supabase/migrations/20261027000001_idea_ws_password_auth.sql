-- ========================================================
-- Idea Workspace: メールアドレス + パスワードによるログイン（Phase 5）
--   * ログイン ID は users.email（citext, unique）。メールアドレスの確認は行わない（メール送信機能が無いため）
--   * パスワードは Argon2id のハッシュのみ保存する（password_credentials）
--   * ゲストのデータを既存アカウントに統合できるよう、子テーブルの複合外部キーに on update cascade を付ける
--     （projects.user_id を書き換えると、配下の sections / notes / prds / versions / preferences も付け替わる）
-- ========================================================

alter table idea_ws.user_identities drop constraint user_identities_provider_check;
alter table idea_ws.user_identities
  add constraint user_identities_provider_check check (provider in ('email', 'google', 'password'));

create table idea_ws.password_credentials (
  user_id uuid primary key references idea_ws.users (id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on idea_ws.password_credentials
  for each row execute function idea_ws.set_updated_at();

-- --------------------------------------------------------
-- ゲストのデータ統合のための on update cascade
-- --------------------------------------------------------

alter table idea_ws.sections
  drop constraint sections_project_id_user_id_fkey,
  add constraint sections_project_id_user_id_fkey foreign key (project_id, user_id)
    references idea_ws.projects (id, user_id) on delete cascade on update cascade;

alter table idea_ws.notes
  drop constraint notes_project_id_user_id_fkey,
  add constraint notes_project_id_user_id_fkey foreign key (project_id, user_id)
    references idea_ws.projects (id, user_id) on delete cascade on update cascade,
  drop constraint notes_section_id_project_id_user_id_fkey,
  add constraint notes_section_id_project_id_user_id_fkey foreign key (section_id, project_id, user_id)
    references idea_ws.sections (id, project_id, user_id) on delete cascade on update cascade;

alter table idea_ws.prd_documents
  drop constraint prd_documents_project_id_user_id_fkey,
  add constraint prd_documents_project_id_user_id_fkey foreign key (project_id, user_id)
    references idea_ws.projects (id, user_id) on delete cascade on update cascade;

alter table idea_ws.prd_versions
  drop constraint prd_versions_prd_document_id_user_id_fkey,
  add constraint prd_versions_prd_document_id_user_id_fkey foreign key (prd_document_id, user_id)
    references idea_ws.prd_documents (id, user_id) on delete cascade on update cascade;

alter table idea_ws.workspace_preferences
  drop constraint workspace_preferences_project_id_user_id_fkey,
  add constraint workspace_preferences_project_id_user_id_fkey foreign key (project_id, user_id)
    references idea_ws.projects (id, user_id) on delete cascade on update cascade;

-- --------------------------------------------------------
-- 権限と RLS（20261026000003_idea_ws_privileges.sql と同じ方針）
-- --------------------------------------------------------

revoke all on idea_ws.password_credentials from public, anon, authenticated, service_role;
grant select, insert, update, delete on idea_ws.password_credentials to idea_ws_app;

alter table idea_ws.password_credentials enable row level security;
create policy idea_ws_app_all on idea_ws.password_credentials
  for all to idea_ws_app using (true) with check (true);
