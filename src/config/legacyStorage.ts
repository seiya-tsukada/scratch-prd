/**
 * 旧バージョン（データをブラウザの localStorage に保存していた頃）のキー。
 * 新しいバージョンはこれらに書き込まない。残っていれば取り込みを提案し、取り込み後に削除する。
 */
export const LEGACY_STORAGE_KEYS = {
  PROJECTS: 'idea_workspace_projects_v2',
  SECTIONS: 'idea_workspace_sections_v2',
  NOTES: 'idea_workspace_notes_v2',
  PRDS: 'idea_workspace_prds_v2',
  PREFS: 'idea_workspace_prefs_v2',
  USER: 'idea_workspace_user_v2',
} as const;

/** 最後に開いていたプロジェクト（表示の利便のためだけに使う。データではない） */
export const LAST_PROJECT_STORAGE_KEY = 'idea_workspace_last_project';
