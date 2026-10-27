import { LEGACY_STORAGE_KEYS } from '../config/legacyStorage';
import type { Note, PrdDocument, Project, Section, WorkspacePreferences } from '../types';

/** POST /api/import/local-project に送る 1 プロジェクト分（ID は旧データのまま。サーバーが振り直す） */
export interface LegacyProjectImport {
  project: Project;
  sections: Section[];
  notes: Note[];
  prds: PrdDocument[];
  preferences?: WorkspacePreferences;
}

export interface LegacyProjectSummary {
  id: string;
  name: string;
  noteCount: number;
  payload: LegacyProjectImport;
}

const readArray = <T>(storage: Storage, key: string): T[] => {
  try {
    const value = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const readPrefs = (storage: Storage): Record<string, WorkspacePreferences> => {
  try {
    const value = JSON.parse(storage.getItem(LEGACY_STORAGE_KEYS.PREFS) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

/** 旧バージョンが localStorage に残したプロジェクトを、取り込み用にプロジェクト単位でまとめる */
export function findLegacyProjects(storage: Storage = localStorage): LegacyProjectSummary[] {
  const sections = readArray<Section>(storage, LEGACY_STORAGE_KEYS.SECTIONS);
  const notes = readArray<Note>(storage, LEGACY_STORAGE_KEYS.NOTES);
  const prds = readArray<PrdDocument>(storage, LEGACY_STORAGE_KEYS.PRDS);
  const prefs = readPrefs(storage);

  return readArray<Project>(storage, LEGACY_STORAGE_KEYS.PROJECTS)
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((project) => {
      const projectNotes = notes.filter((n) => n.projectId === project.id);
      return {
        id: project.id,
        name: project.name,
        noteCount: projectNotes.length,
        payload: {
          project,
          sections: sections.filter((s) => s.projectId === project.id),
          notes: projectNotes,
          prds: prds.filter((p) => p.projectId === project.id),
          preferences: prefs[project.id],
        },
      };
    });
}

/** 取り込めたプロジェクトの分だけ localStorage から消す。プロジェクトが残らなければ旧キーをすべて消す */
export function removeLegacyProject(projectId: string, storage: Storage = localStorage): void {
  const keep = <T extends { projectId?: string; id?: string }>(key: string, isTarget: (item: T) => boolean) => {
    storage.setItem(key, JSON.stringify(readArray<T>(storage, key).filter((item) => !isTarget(item))));
  };
  keep<Project>(LEGACY_STORAGE_KEYS.PROJECTS, (p) => p.id === projectId);
  keep<Section>(LEGACY_STORAGE_KEYS.SECTIONS, (s) => s.projectId === projectId);
  keep<Note>(LEGACY_STORAGE_KEYS.NOTES, (n) => n.projectId === projectId);
  keep<PrdDocument>(LEGACY_STORAGE_KEYS.PRDS, (p) => p.projectId === projectId);
  const prefs = readPrefs(storage);
  delete prefs[projectId];
  storage.setItem(LEGACY_STORAGE_KEYS.PREFS, JSON.stringify(prefs));

  if (readArray(storage, LEGACY_STORAGE_KEYS.PROJECTS).length === 0) {
    clearLegacyData(storage);
  }
}

export function clearLegacyData(storage: Storage = localStorage): void {
  Object.values(LEGACY_STORAGE_KEYS).forEach((key) => storage.removeItem(key));
}
