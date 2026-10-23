import {
  Project,
  Section,
  Note,
  PrdDocument,
  PrdVersion,
  WorkspacePreferences,
  UserProfile,
} from '../types';
import { DEFAULT_ACTIVE_PANE_ID, DEFAULT_PANE_COUNT } from '../config/app';
import { ID_PREFIX, STORAGE_KEYS } from '../config/storage';
import {
  CUSTOM_SECTION_ICON,
  DEFAULT_PANE_ASSIGNMENTS,
  DEFAULT_USER,
  INITIAL_NOTES,
  INITIAL_PRD,
  INITIAL_PROJECT,
  INITIAL_PROJECT_ID,
  INITIAL_SECTIONS,
  NEW_PROJECT_SECTION_TEMPLATES,
} from '../config/seed';

export interface IWorkspaceRepository {
  getCurrentUser(): UserProfile;
  getProjects(): Project[];
  getProject(id: string): Project | undefined;
  createProject(name: string, description?: string): Project;
  updateProject(id: string, updates: Partial<Project>): Project;
  deleteProject(id: string): void;

  getSections(projectId: string): Section[];
  createSection(projectId: string, name: string): Section;
  updateSection(id: string, updates: Partial<Section>): Section;
  deleteSection(id: string): void;
  reorderSections(projectId: string, orderedIds: string[]): void;

  getNotes(projectId: string): Note[];
  getNote(id: string): Note | undefined;
  createNote(projectId: string, sectionId: string, title?: string, content?: string): Note;
  updateNote(id: string, updates: Partial<Note>): Note;
  deleteNote(id: string): void;
  moveNote(id: string, targetSectionId: string): Note;

  getPrdDocuments(projectId: string): PrdDocument[];
  getPrdDocument(id: string): PrdDocument | undefined;
  savePrdDocument(prd: Omit<PrdDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): PrdDocument;
  deletePrdDocument(id: string): void;

  getPreferences(projectId: string): WorkspacePreferences;
  savePreferences(prefs: WorkspacePreferences): void;
}

const nowIso = () => new Date().toISOString();
const generateId = (prefix: string) => prefix + Date.now();
const byUpdatedAtDesc = (a: { updatedAt: string }, b: { updatedAt: string }) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

class LocalStorageWorkspaceRepository implements IWorkspaceRepository {
  private get<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.warn('LocalStorage read error for key:', key, e);
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('LocalStorage write error for key:', key, e);
    }
  }

  /** id で要素を探して部分更新し、保存したうえで更新後の要素を返す */
  private updateItem<T extends { id: string; updatedAt: string }>(
    key: string,
    items: T[],
    id: string,
    updates: Partial<T>,
    notFoundMessage: string
  ): T {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error(notFoundMessage);
    const updated: T = { ...items[index], ...updates, updatedAt: nowIso() };
    items[index] = updated;
    this.set(key, items);
    return updated;
  }

  private removeWhere<T>(key: string, shouldRemove: (item: T) => boolean): void {
    const remaining = this.get<T[]>(key, []).filter((item) => !shouldRemove(item));
    this.set(key, remaining);
  }

  getCurrentUser(): UserProfile {
    return this.get<UserProfile>(STORAGE_KEYS.USER, DEFAULT_USER);
  }

  getProjects(): Project[] {
    const projects = this.get<Project[]>(STORAGE_KEYS.PROJECTS, []);
    if (projects.length > 0) return projects;

    // 初回起動: サンプルデータを投入
    const initialProject: Project = {
      id: INITIAL_PROJECT_ID,
      userId: DEFAULT_USER.id,
      ...INITIAL_PROJECT,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.set(STORAGE_KEYS.PROJECTS, [initialProject]);
    this.set(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS);
    this.set(STORAGE_KEYS.NOTES, INITIAL_NOTES);
    this.set(STORAGE_KEYS.PRDS, [INITIAL_PRD]);
    return [initialProject];
  }

  getProject(id: string): Project | undefined {
    return this.getProjects().find((p) => p.id === id);
  }

  createProject(name: string, description = ''): Project {
    const projects = this.getProjects();
    const timestamp = nowIso();
    const newProj: Project = {
      id: generateId(ID_PREFIX.PROJECT),
      userId: DEFAULT_USER.id,
      name,
      description,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    projects.unshift(newProj);
    this.set(STORAGE_KEYS.PROJECTS, projects);

    const defaultSections: Section[] = NEW_PROJECT_SECTION_TEMPLATES.map((template, index) => ({
      id: `${generateId(ID_PREFIX.SECTION)}-${index + 1}`,
      projectId: newProj.id,
      userId: DEFAULT_USER.id,
      name: template.name,
      position: index,
      icon: template.icon,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const currentSections = this.get<Section[]>(STORAGE_KEYS.SECTIONS, []);
    this.set(STORAGE_KEYS.SECTIONS, [...currentSections, ...defaultSections]);

    return newProj;
  }

  updateProject(id: string, updates: Partial<Project>): Project {
    return this.updateItem(STORAGE_KEYS.PROJECTS, this.getProjects(), id, updates, 'Project not found');
  }

  deleteProject(id: string): void {
    this.set(
      STORAGE_KEYS.PROJECTS,
      this.getProjects().filter((p) => p.id !== id)
    );
    this.removeWhere<Section>(STORAGE_KEYS.SECTIONS, (s) => s.projectId === id);
    this.removeWhere<Note>(STORAGE_KEYS.NOTES, (n) => n.projectId === id);
    this.removeWhere<PrdDocument>(STORAGE_KEYS.PRDS, (p) => p.projectId === id);
  }

  getSections(projectId: string): Section[] {
    return this.get<Section[]>(STORAGE_KEYS.SECTIONS, INITIAL_SECTIONS)
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.position - b.position);
  }

  createSection(projectId: string, name: string): Section {
    const all = this.get<Section[]>(STORAGE_KEYS.SECTIONS, []);
    const projSections = all.filter((s) => s.projectId === projectId);
    const timestamp = nowIso();
    const newSection: Section = {
      id: generateId(ID_PREFIX.SECTION),
      projectId,
      userId: DEFAULT_USER.id,
      name,
      position: projSections.length,
      icon: CUSTOM_SECTION_ICON,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    all.push(newSection);
    this.set(STORAGE_KEYS.SECTIONS, all);
    return newSection;
  }

  updateSection(id: string, updates: Partial<Section>): Section {
    const all = this.get<Section[]>(STORAGE_KEYS.SECTIONS, []);
    return this.updateItem(STORAGE_KEYS.SECTIONS, all, id, updates, 'Section not found');
  }

  deleteSection(id: string): void {
    this.removeWhere<Section>(STORAGE_KEYS.SECTIONS, (s) => s.id === id);
  }

  reorderSections(projectId: string, orderedIds: string[]): void {
    const all = this.get<Section[]>(STORAGE_KEYS.SECTIONS, []);
    const updated = all.map((sec) => {
      if (sec.projectId !== projectId) return sec;
      const newPos = orderedIds.indexOf(sec.id);
      return newPos === -1 ? sec : { ...sec, position: newPos, updatedAt: nowIso() };
    });
    this.set(STORAGE_KEYS.SECTIONS, updated);
  }

  getNotes(projectId: string): Note[] {
    return this.get<Note[]>(STORAGE_KEYS.NOTES, INITIAL_NOTES)
      .filter((n) => n.projectId === projectId)
      .sort(byUpdatedAtDesc);
  }

  getNote(id: string): Note | undefined {
    return this.get<Note[]>(STORAGE_KEYS.NOTES, INITIAL_NOTES).find((n) => n.id === id);
  }

  createNote(projectId: string, sectionId: string, title = '', content = ''): Note {
    const all = this.get<Note[]>(STORAGE_KEYS.NOTES, []);
    const timestamp = nowIso();
    const newNote: Note = {
      id: generateId(ID_PREFIX.NOTE),
      projectId,
      sectionId,
      userId: DEFAULT_USER.id,
      title,
      content,
      position: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    all.unshift(newNote);
    this.set(STORAGE_KEYS.NOTES, all);
    return newNote;
  }

  updateNote(id: string, updates: Partial<Note>): Note {
    const all = this.get<Note[]>(STORAGE_KEYS.NOTES, []);
    return this.updateItem(STORAGE_KEYS.NOTES, all, id, updates, 'Note not found: ' + id);
  }

  deleteNote(id: string): void {
    this.removeWhere<Note>(STORAGE_KEYS.NOTES, (n) => n.id === id);
  }

  moveNote(id: string, targetSectionId: string): Note {
    return this.updateNote(id, { sectionId: targetSectionId });
  }

  getPrdDocuments(projectId: string): PrdDocument[] {
    return this.get<PrdDocument[]>(STORAGE_KEYS.PRDS, [INITIAL_PRD])
      .filter((p) => p.projectId === projectId)
      .sort(byUpdatedAtDesc);
  }

  getPrdDocument(id: string): PrdDocument | undefined {
    return this.get<PrdDocument[]>(STORAGE_KEYS.PRDS, [INITIAL_PRD]).find((p) => p.id === id);
  }

  /** id が既存PRDと一致すれば旧版を履歴に積んで更新、それ以外は新規作成 */
  savePrdDocument(
    prdData: Omit<PrdDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): PrdDocument {
    const all = this.get<PrdDocument[]>(STORAGE_KEYS.PRDS, []);
    const now = nowIso();

    const index = prdData.id ? all.findIndex((p) => p.id === prdData.id) : -1;
    if (index !== -1) {
      const existing = all[index];
      const versionEntry = this.createVersionSnapshot(existing);

      const updated: PrdDocument = {
        ...existing,
        ...prdData,
        id: existing.id,
        version: (existing.version || 1) + 1,
        versions: [versionEntry, ...(existing.versions || [])],
        updatedAt: now,
      };
      all[index] = updated;
      this.set(STORAGE_KEYS.PRDS, all);
      return updated;
    }

    const newPrd: PrdDocument = {
      ...prdData,
      id: prdData.id || generateId(ID_PREFIX.PRD),
      version: 1,
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    all.unshift(newPrd);
    this.set(STORAGE_KEYS.PRDS, all);
    return newPrd;
  }

  private createVersionSnapshot(prd: PrdDocument): PrdVersion {
    return {
      id: generateId(ID_PREFIX.PRD_VERSION),
      prdDocumentId: prd.id,
      versionNumber: prd.version,
      title: prd.title,
      content: prd.content,
      generationMode: prd.generationMode,
      detailLevel: prd.detailLevel,
      sourceNoteIds: prd.sourceNoteIds,
      facts: prd.facts,
      proposals: prd.proposals,
      openQuestions: prd.openQuestions,
      contradictions: prd.contradictions,
      createdAt: prd.updatedAt,
      summary: `Version ${prd.version} (${prd.generationMode})`,
    };
  }

  deletePrdDocument(id: string): void {
    this.removeWhere<PrdDocument>(STORAGE_KEYS.PRDS, (p) => p.id === id);
  }

  getPreferences(projectId: string): WorkspacePreferences {
    const allPrefs = this.get<Record<string, WorkspacePreferences>>(STORAGE_KEYS.PREFS, {});
    if (allPrefs[projectId]) {
      return allPrefs[projectId];
    }
    return {
      id: ID_PREFIX.PREFERENCES + projectId,
      userId: DEFAULT_USER.id,
      projectId,
      paneCount: DEFAULT_PANE_COUNT,
      panes: DEFAULT_PANE_ASSIGNMENTS.map((pane) => ({ ...pane })),
      activePaneId: DEFAULT_ACTIVE_PANE_ID,
      updatedAt: nowIso(),
    };
  }

  savePreferences(prefs: WorkspacePreferences): void {
    const allPrefs = this.get<Record<string, WorkspacePreferences>>(STORAGE_KEYS.PREFS, {});
    allPrefs[prefs.projectId] = { ...prefs, updatedAt: nowIso() };
    this.set(STORAGE_KEYS.PREFS, allPrefs);
  }
}

export const workspaceRepository = new LocalStorageWorkspaceRepository();
