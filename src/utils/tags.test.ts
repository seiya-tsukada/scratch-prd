import { describe, expect, it } from 'vitest';
import { countNotesByTag, filterNotesByTags, findTagByName, sortTags, suggestTags } from './tags';
import type { Note, Tag } from '../types';

const tag = (id: string, name: string): Tag => ({
  id,
  projectId: 'p',
  userId: 'u',
  name,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const note = (id: string, tagIds: string[]): Note => ({
  id,
  projectId: 'p',
  userId: 'u',
  title: id,
  content: '',
  position: 0,
  tagIds,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const tags = [tag('t1', 'MVP'), tag('t2', 'ux'), tag('t3', 'Backend'), tag('t4', 'mobile')];

describe('tags', () => {
  it('findTagByName は大文字小文字と前後の空白を区別しない', () => {
    expect(findTagByName(tags, '  mvp ')?.id).toBe('t1');
    expect(findTagByName(tags, 'UX')?.id).toBe('t2');
    expect(findTagByName(tags, '')).toBeUndefined();
    expect(findTagByName(tags, 'none')).toBeUndefined();
  });

  it('sortTags は名前の昇順（大文字小文字を区別しない）', () => {
    expect(sortTags(tags).map((t) => t.name)).toEqual(['Backend', 'mobile', 'MVP', 'ux']);
  });

  it('suggestTags は付いていないタグから、前方一致を先に返す', () => {
    expect(suggestTags(tags, 'm', []).map((t) => t.id)).toEqual(['t4', 't1']);
    expect(suggestTags(tags, 'b', ['t3']).map((t) => t.id)).toEqual(['t4']);
    expect(suggestTags(tags, 'e', []).map((t) => t.id)).toEqual(['t3', 't4']);
  });

  it('filterNotesByTags は選んだタグをすべて持つメモだけ残す（AND）', () => {
    const notes = [note('a', ['t1', 't2']), note('b', ['t1']), note('c', [])];
    expect(filterNotesByTags(notes, []).map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(filterNotesByTags(notes, ['t1']).map((n) => n.id)).toEqual(['a', 'b']);
    expect(filterNotesByTags(notes, ['t1', 't2']).map((n) => n.id)).toEqual(['a']);
  });

  it('countNotesByTag はタグごとのメモ数を数える', () => {
    const counts = countNotesByTag([note('a', ['t1', 't2']), note('b', ['t1'])]);
    expect(counts.get('t1')).toBe(2);
    expect(counts.get('t2')).toBe(1);
    expect(counts.get('t3')).toBeUndefined();
  });
});
