-- ========================================================
-- Idea Workspace: メモのタグ
--   * タグはプロジェクト（ワークスペース）単位。名前は大文字小文字を区別せずユニーク。色は任意
--   * メモとタグは多対多（note_tags）。タグやメモを消すと紐付けも消える
--   * PRD にはタグを付けない
--   * ゲストの統合（projects.user_id の書き換え）で一緒に付け替わるよう、複合外部キーに on update cascade を付ける
-- ========================================================

-- note_tags から (id, project_id, user_id) で参照するため
alter table idea_ws.notes
  add constraint notes_id_project_id_user_id_key unique (id, project_id, user_id);

create table idea_ws.tags (
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

create unique index tags_project_name_idx on idea_ws.tags (user_id, project_id, lower(name));

create table idea_ws.note_tags (
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
create index note_tags_tag_idx on idea_ws.note_tags (tag_id);

create trigger set_updated_at before update on idea_ws.tags
  for each row execute function idea_ws.set_updated_at();

-- --------------------------------------------------------
-- 権限と RLS（20261026000003_idea_ws_privileges.sql と同じ方針）
-- --------------------------------------------------------

revoke all on idea_ws.tags, idea_ws.note_tags from public, anon, authenticated, service_role;
grant select, insert, update, delete on idea_ws.tags, idea_ws.note_tags to idea_ws_app;

alter table idea_ws.tags enable row level security;
create policy idea_ws_app_all on idea_ws.tags for all to idea_ws_app using (true) with check (true);

alter table idea_ws.note_tags enable row level security;
create policy idea_ws_app_all on idea_ws.note_tags for all to idea_ws_app using (true) with check (true);
