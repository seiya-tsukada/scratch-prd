-- ========================================================
-- Idea Workspace: セクションの廃止と、メモ / PRD の分離
--   * 名前が「PRD」で始まるセクションのメモは PRD（prd_documents）に変換する。
--     生成元メモ（source_note_ids）は空、生成モードは不明（'unknown'）。変換したメモは削除する
--   * それ以外のメモはそのまま残し、セクションの情報だけ捨てる
--   * sections / section_templates / notes.section_id を削除する
--   * サンプル（sample_contents）からもセクションの情報を除く
-- ========================================================

-- 生成モードに「不明」を足す（旧データから変換した PRD 用。AI の生成には使わない）
alter table idea_ws.prd_documents
  drop constraint prd_documents_generation_mode_check,
  add constraint prd_documents_generation_mode_check
    check (generation_mode in ('strict', 'suggest', 'expand', 'unknown'));

alter table idea_ws.prd_versions
  drop constraint prd_versions_generation_mode_check,
  add constraint prd_versions_generation_mode_check
    check (generation_mode in ('strict', 'suggest', 'expand', 'unknown'));

-- PRD セクションのメモ
create temporary table prd_section_notes on commit drop as
select n.*
from idea_ws.notes n
join idea_ws.sections s on s.id = n.section_id and s.user_id = n.user_id
where s.name ~* '^\s*PRD';

-- タイトルが空なら本文の 1 行目（見出し記号を除く）、それも空なら既定のタイトル。
-- 前後の空白（全角スペースを含む）は除く（legacy_import._prd_title の str.strip() と揃える）
insert into idea_ws.prd_documents
  (user_id, project_id, title, content, generation_mode, source_note_ids, created_at, updated_at)
select
  user_id,
  project_id,
  left(
    coalesce(
      nullif(regexp_replace(title, '^[[:space:]　]+|[[:space:]　]+$', '', 'g'), ''),
      nullif(
        regexp_replace(
          regexp_replace(split_part(content, E'\n', 1), '^#+\s*', ''),
          '^[[:space:]　]+|[[:space:]　]+$', '', 'g'
        ),
        ''
      ),
      '無題のPRD'
    ),
    200
  ),
  content,
  'unknown',
  '{}',
  created_at,
  updated_at
from prd_section_notes;

-- 変換したメモを開いていたペインは空にする
update idea_ws.workspace_preferences p
set panes = (
  select jsonb_agg(
    case
      when e ->> 'noteId' in (select id::text from prd_section_notes) then jsonb_set(e, '{noteId}', 'null'::jsonb)
      else e
    end
    order by t.ord
  )
  from jsonb_array_elements(p.panes) with ordinality as t (e, ord)
)
where exists (
  select 1 from jsonb_array_elements(p.panes) e
  where e ->> 'noteId' in (select id::text from prd_section_notes)
);

delete from idea_ws.notes where id in (select id from prd_section_notes);

-- セクションの削除（notes の外部キーとインデックスも一緒に消える）
alter table idea_ws.notes drop column section_id;
drop table idea_ws.sections;
drop table idea_ws.section_templates;

-- サンプルからセクションの情報を除く（sections と notes[].sectionKey）
update idea_ws.sample_contents
set content = (content - 'sections') || jsonb_build_object(
  'notes',
  coalesce(
    (
      select jsonb_agg(note - 'sectionKey' order by t.ord)
      from jsonb_array_elements(content -> 'notes') with ordinality as t (note, ord)
    ),
    '[]'::jsonb
  )
)
where content ? 'sections' or content -> 'notes' @> '[{}]';
