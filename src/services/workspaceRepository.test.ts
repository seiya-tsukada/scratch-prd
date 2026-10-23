import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workspaceRepository as repo } from './workspaceRepository';
import { STORAGE_KEYS } from '../config/storage';
import { INITIAL_NOTES, INITIAL_PRD, INITIAL_PROJECT_ID, INITIAL_SECTIONS, NEW_PROJECT_SECTION_TEMPLATES } from '../config/seed';
import { DEFAULT_PANE_COUNT } from '../config/app';

const basePrd = {
  projectId: INITIAL_PROJECT_ID,
  userId: 'u',
  title: 'PRD',
  content: 'v1',
  generationMode: 'suggest' as const,
  detailLevel: 'standard' as const,
  sourceNoteIds: [],
  facts: [],
  proposals: [],
  openQuestions: [],
  contradictions: [],
  version: 1,
};

// Node 組み込みの localStorage は起動オプション無しでは使えないため、メモリ実装に差し替える
const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

describe('初回起動', () => {
  it('プロジェクトが無ければサンプルデータを投入する', () => {
    const projects = repo.getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe(INITIAL_PROJECT_ID);
    expect(repo.getSections(INITIAL_PROJECT_ID)).toHaveLength(INITIAL_SECTIONS.length);
    expect(repo.getNotes(INITIAL_PROJECT_ID)).toHaveLength(INITIAL_NOTES.length);
    expect(repo.getPrdDocuments(INITIAL_PROJECT_ID).map((p) => p.id)).toEqual([INITIAL_PRD.id]);
  });

  it('メモは更新日時の新しい順に返す', () => {
    repo.getProjects();
    const notes = repo.getNotes(INITIAL_PROJECT_ID);
    const times = notes.map((n) => new Date(n.updatedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe('プロジェクト', () => {
  it('新規プロジェクトは先頭に追加され、デフォルトセクションが作られる', () => {
    repo.getProjects();
    const proj = repo.createProject('New');
    expect(repo.getProjects()[0].id).toBe(proj.id);

    const sections = repo.getSections(proj.id);
    expect(sections.map((s) => s.name)).toEqual(NEW_PROJECT_SECTION_TEMPLATES.map((t) => t.name));
    expect(sections.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it('削除するとセクション・メモ・PRDもまとめて消える', () => {
    repo.getProjects();
    repo.deleteProject(INITIAL_PROJECT_ID);
    expect(repo.getSections(INITIAL_PROJECT_ID)).toEqual([]);
    expect(repo.getNotes(INITIAL_PROJECT_ID)).toEqual([]);
    expect(repo.getPrdDocuments(INITIAL_PROJECT_ID)).toEqual([]);
  });
});

describe('メモ', () => {
  it('作成・更新・移動・削除ができる', () => {
    repo.getProjects();
    const note = repo.createNote(INITIAL_PROJECT_ID, 'sec-inbox', 'title', 'body');
    expect(repo.getNote(note.id)?.content).toBe('body');

    repo.updateNote(note.id, { content: 'changed' });
    expect(repo.getNote(note.id)?.content).toBe('changed');

    repo.moveNote(note.id, 'sec-prd');
    expect(repo.getNote(note.id)?.sectionId).toBe('sec-prd');

    repo.deleteNote(note.id);
    expect(repo.getNote(note.id)).toBeUndefined();
  });

  it('存在しないメモの更新はエラーになる', () => {
    expect(() => repo.updateNote('missing', { title: 'x' })).toThrow('Note not found: missing');
  });
});

describe('PRDの版管理', () => {
  it('既存IDで保存すると旧版が履歴に積まれ、版番号が上がる', () => {
    const created = repo.savePrdDocument(basePrd);
    expect(created.version).toBe(1);
    expect(created.versions).toEqual([]);

    const updated = repo.savePrdDocument({ ...basePrd, id: created.id, content: 'v2' });
    expect(updated.id).toBe(created.id);
    expect(updated.version).toBe(2);
    expect(updated.content).toBe('v2');
    expect(updated.versions).toHaveLength(1);
    expect(updated.versions![0]).toMatchObject({ versionNumber: 1, content: 'v1', prdDocumentId: created.id });
  });

  it('未知のIDを指定した場合はそのIDで新規作成する', () => {
    const prd = repo.savePrdDocument({ ...basePrd, id: 'prd-custom' });
    expect(prd.id).toBe('prd-custom');
    expect(prd.version).toBe(1);
  });
});

describe('ワークスペース設定', () => {
  it('未保存ならデフォルトを返し、保存後は保存値を返す', () => {
    const prefs = repo.getPreferences('p1');
    expect(prefs.paneCount).toBe(DEFAULT_PANE_COUNT);
    expect(prefs.panes).toHaveLength(4);
    expect(localStorage.getItem(STORAGE_KEYS.PREFS)).toBeNull();

    repo.savePreferences({ ...prefs, paneCount: 4 });
    expect(repo.getPreferences('p1').paneCount).toBe(4);
  });

  it('デフォルト設定のペイン配列は呼び出しごとに別インスタンス', () => {
    const a = repo.getPreferences('p1');
    a.panes[0].noteId = 'mutated';
    expect(repo.getPreferences('p1').panes[0].noteId).not.toBe('mutated');
  });
});
