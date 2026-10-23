/** localStorage のキー。値を変えると既存データが読めなくなるので注意 */
export const STORAGE_KEYS = {
  PROJECTS: 'idea_workspace_projects_v2',
  SECTIONS: 'idea_workspace_sections_v2',
  NOTES: 'idea_workspace_notes_v2',
  PRDS: 'idea_workspace_prds_v2',
  PREFS: 'idea_workspace_prefs_v2',
  USER: 'idea_workspace_user_v2',
} as const;

/** 各エンティティIDのプレフィックス */
export const ID_PREFIX = {
  PROJECT: 'proj-',
  SECTION: 'sec-',
  NOTE: 'note-',
  PRD: 'prd-',
  PRD_VERSION: 'ver-',
  PREFERENCES: 'prefs-',
} as const;
