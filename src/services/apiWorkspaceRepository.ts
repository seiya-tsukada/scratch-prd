import { Note, PaneInfo, PrdDocument, Project, Section, WorkspacePreferences } from '../types';
import { ApiError, requestJson } from './apiClient';
import type { LegacyProjectImport } from './legacyImport';

export interface ProjectData {
  sections: Section[];
  notes: Note[];
  prds: PrdDocument[];
  preferences: WorkspacePreferences;
}

/** プロジェクトが無ければ currentProjectId / data は省略される */
export interface Bootstrap {
  projects: Project[];
  currentProjectId?: string;
  data?: ProjectData;
}

export type PrdInput = Pick<
  PrdDocument,
  | 'title'
  | 'content'
  | 'generationMode'
  | 'detailLevel'
  | 'sourceNoteIds'
  | 'facts'
  | 'proposals'
  | 'openQuestions'
  | 'contradictions'
>;

export type PreferencesInput = Pick<WorkspacePreferences, 'paneCount' | 'panes' | 'activePaneId'>;

/** メモの部分更新で送れる項目 */
export type NoteFields = Partial<Pick<Note, 'title' | 'content' | 'sectionId'>>;

export interface ImportResult {
  projectId: string;
  sections: number;
  notes: number;
  prds: number;
}

/** メモが baseUpdatedAt より後に他で更新されていた（latest は最新のメモ） */
export class ConflictError extends Error {
  constructor(readonly latest: Note) {
    super('note was updated elsewhere');
  }
}

export interface IWorkspaceRepository {
  bootstrap(projectId?: string): Promise<Bootstrap>;
  getProjectData(projectId: string): Promise<ProjectData>;

  createProject(name: string, description?: string): Promise<Project>;
  updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  createSection(projectId: string, name: string): Promise<Section>;
  updateSection(id: string, updates: Partial<Pick<Section, 'name' | 'icon'>>): Promise<Section>;
  deleteSection(id: string): Promise<void>;
  reorderSections(projectId: string, orderedIds: string[]): Promise<Section[]>;

  createNote(projectId: string, sectionId: string, title?: string, content?: string): Promise<Note>;
  /** baseUpdatedAt を渡すと、それより後に更新されていれば ConflictError */
  updateNote(id: string, updates: NoteFields, baseUpdatedAt?: string): Promise<Note>;
  deleteNote(id: string): Promise<void>;

  createPrd(projectId: string, prd: PrdInput): Promise<PrdDocument>;
  /** 現在の内容を版履歴に積んでから更新する */
  savePrdVersion(id: string, prd: PrdInput): Promise<PrdDocument>;
  deletePrd(id: string): Promise<void>;

  savePreferences(projectId: string, prefs: PreferencesInput): Promise<WorkspacePreferences>;

  importLegacyProject(data: LegacyProjectImport): Promise<ImportResult>;
}

/** API は値の無い noteId を省略して返すので null に揃える */
const normalizePanes = (panes: PaneInfo[]): PaneInfo[] => panes.map((p) => ({ id: p.id, noteId: p.noteId ?? null }));

const normalizeProjectData = (data: ProjectData): ProjectData => ({
  ...data,
  preferences: { ...data.preferences, panes: normalizePanes(data.preferences.panes) },
});

const toPrdBody = (prd: PrdInput): PrdInput => ({
  title: prd.title,
  content: prd.content,
  generationMode: prd.generationMode,
  detailLevel: prd.detailLevel,
  sourceNoteIds: prd.sourceNoteIds,
  facts: prd.facts,
  proposals: prd.proposals,
  openQuestions: prd.openQuestions,
  contradictions: prd.contradictions,
});

export class ApiWorkspaceRepository implements IWorkspaceRepository {
  async bootstrap(projectId?: string): Promise<Bootstrap> {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const body = await requestJson<Bootstrap>(`/api/workspace/bootstrap${query}`);
    return body.data ? { ...body, data: normalizeProjectData(body.data) } : body;
  }

  async getProjectData(projectId: string): Promise<ProjectData> {
    return normalizeProjectData(await requestJson<ProjectData>(`/api/projects/${projectId}/data`));
  }

  createProject(name: string, description = ''): Promise<Project> {
    return requestJson('/api/projects', { method: 'POST', body: { name, description } });
  }

  updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project> {
    return requestJson(`/api/projects/${id}`, { method: 'PATCH', body: updates });
  }

  deleteProject(id: string): Promise<void> {
    return requestJson(`/api/projects/${id}`, { method: 'DELETE' });
  }

  createSection(projectId: string, name: string): Promise<Section> {
    return requestJson(`/api/projects/${projectId}/sections`, { method: 'POST', body: { name } });
  }

  updateSection(id: string, updates: Partial<Pick<Section, 'name' | 'icon'>>): Promise<Section> {
    return requestJson(`/api/sections/${id}`, { method: 'PATCH', body: updates });
  }

  deleteSection(id: string): Promise<void> {
    return requestJson(`/api/sections/${id}`, { method: 'DELETE' });
  }

  reorderSections(projectId: string, orderedIds: string[]): Promise<Section[]> {
    return requestJson(`/api/projects/${projectId}/sections/order`, { method: 'PUT', body: { orderedIds } });
  }

  createNote(projectId: string, sectionId: string, title = '', content = ''): Promise<Note> {
    return requestJson(`/api/projects/${projectId}/notes`, { method: 'POST', body: { sectionId, title, content } });
  }

  async updateNote(id: string, updates: NoteFields, baseUpdatedAt?: string): Promise<Note> {
    try {
      return await requestJson<Note>(`/api/notes/${id}`, { method: 'PATCH', body: { ...updates, baseUpdatedAt } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'conflict') {
        throw new ConflictError((e.detail as { note: Note }).note);
      }
      throw e;
    }
  }

  deleteNote(id: string): Promise<void> {
    return requestJson(`/api/notes/${id}`, { method: 'DELETE' });
  }

  createPrd(projectId: string, prd: PrdInput): Promise<PrdDocument> {
    return requestJson(`/api/projects/${projectId}/prds`, { method: 'POST', body: toPrdBody(prd) });
  }

  savePrdVersion(id: string, prd: PrdInput): Promise<PrdDocument> {
    return requestJson(`/api/prds/${id}`, { method: 'PUT', body: toPrdBody(prd) });
  }

  deletePrd(id: string): Promise<void> {
    return requestJson(`/api/prds/${id}`, { method: 'DELETE' });
  }

  async savePreferences(projectId: string, prefs: PreferencesInput): Promise<WorkspacePreferences> {
    const saved = await requestJson<WorkspacePreferences>(`/api/projects/${projectId}/preferences`, {
      method: 'PUT',
      body: { paneCount: prefs.paneCount, panes: prefs.panes, activePaneId: prefs.activePaneId },
    });
    return { ...saved, panes: normalizePanes(saved.panes) };
  }

  importLegacyProject(data: LegacyProjectImport): Promise<ImportResult> {
    return requestJson('/api/import/local-project', { method: 'POST', body: data });
  }
}

export const workspaceRepository: IWorkspaceRepository = new ApiWorkspaceRepository();
