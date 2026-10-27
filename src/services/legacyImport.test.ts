import { describe, expect, it } from 'vitest';
import { clearLegacyData, findLegacyProjects, removeLegacyProject } from './legacyImport';
import { LEGACY_STORAGE_KEYS } from '../config/legacyStorage';

// Node 組み込みの localStorage は起動オプション無しでは使えないため、メモリ実装を使う
const createMemoryStorage = (initial: Record<string, unknown> = {}): Storage => {
  const store = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
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

const legacy = () =>
  createMemoryStorage({
    [LEGACY_STORAGE_KEYS.PROJECTS]: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
    [LEGACY_STORAGE_KEYS.SECTIONS]: [
      { id: 's1', projectId: 'p1', name: 'S1' },
      { id: 's2', projectId: 'p2', name: 'S2' },
    ],
    [LEGACY_STORAGE_KEYS.NOTES]: [
      { id: 'n1', projectId: 'p1', sectionId: 's1' },
      { id: 'n2', projectId: 'p1', sectionId: 's1' },
      { id: 'n3', projectId: 'p2', sectionId: 's2' },
    ],
    [LEGACY_STORAGE_KEYS.PRDS]: [{ id: 'prd1', projectId: 'p2' }],
    [LEGACY_STORAGE_KEYS.PREFS]: { p1: { projectId: 'p1', paneCount: 2, panes: [], activePaneId: 'pane-0' } },
    [LEGACY_STORAGE_KEYS.USER]: { id: 'usr-default-01' },
  });

describe('findLegacyProjects', () => {
  it('旧データをプロジェクトごとにまとめる', () => {
    const projects = findLegacyProjects(legacy());
    expect(projects.map((p) => [p.id, p.name, p.noteCount])).toEqual([
      ['p1', 'One', 2],
      ['p2', 'Two', 1],
    ]);
    expect(projects[0].payload.sections.map((s) => s.id)).toEqual(['s1']);
    expect(projects[0].payload.preferences?.paneCount).toBe(2);
    expect(projects[1].payload.prds.map((p) => p.id)).toEqual(['prd1']);
    expect(projects[1].payload.preferences).toBeUndefined();
  });

  it('旧データが無い・壊れている場合は空', () => {
    expect(findLegacyProjects(createMemoryStorage())).toEqual([]);
    expect(findLegacyProjects(createMemoryStorage({ [LEGACY_STORAGE_KEYS.PROJECTS]: '{broken' }))).toEqual([]);
    expect(findLegacyProjects(createMemoryStorage({ [LEGACY_STORAGE_KEYS.PROJECTS]: { not: 'array' } }))).toEqual([]);
  });
});

describe('removeLegacyProject', () => {
  it('取り込んだプロジェクトの分だけ消し、残りは次回また提案できる', () => {
    const storage = legacy();
    removeLegacyProject('p1', storage);

    const remaining = findLegacyProjects(storage);
    expect(remaining.map((p) => p.id)).toEqual(['p2']);
    expect(remaining[0].payload.notes.map((n) => n.id)).toEqual(['n3']);
    expect(JSON.parse(storage.getItem(LEGACY_STORAGE_KEYS.PREFS)!)).toEqual({});
  });

  it('最後のプロジェクトを消したら旧キーをすべて消す', () => {
    const storage = legacy();
    removeLegacyProject('p1', storage);
    removeLegacyProject('p2', storage);
    expect(storage.length).toBe(0);
  });
});

describe('clearLegacyData', () => {
  it('旧キーだけを消す', () => {
    const storage = legacy();
    storage.setItem('other', 'keep');
    clearLegacyData(storage);
    expect(storage.length).toBe(1);
    expect(storage.getItem('other')).toBe('keep');
  });
});
