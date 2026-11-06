import type { Note, Tag } from '../types';

const normalize = (name: string) => name.trim().toLowerCase();

/** 名前が一致するタグ（大文字小文字・前後の空白を区別しない） */
export const findTagByName = (tags: Tag[], name: string): Tag | undefined => {
  const key = normalize(name);
  return key ? tags.find((t) => normalize(t.name) === key) : undefined;
};

/** 名前の昇順（大文字小文字を区別しない）。サーバーの並びと同じ */
export const sortTags = (tags: Tag[]): Tag[] =>
  [...tags].sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)) || a.id.localeCompare(b.id));

/** 入力補完の候補: まだ付いていないタグのうち、名前に query を含むもの（前方一致を先に） */
export const suggestTags = (tags: Tag[], query: string, excludeIds: string[]): Tag[] => {
  const key = normalize(query);
  const candidates = tags.filter((t) => !excludeIds.includes(t.id) && normalize(t.name).includes(key));
  return [...candidates].sort((a, b) => {
    const aStarts = normalize(a.name).startsWith(key) ? 0 : 1;
    const bStarts = normalize(b.name).startsWith(key) ? 0 : 1;
    return aStarts - bStarts || normalize(a.name).localeCompare(normalize(b.name));
  });
};

/** 選んだタグをすべて持つメモ（AND）。選択が空なら全件 */
export const filterNotesByTags = (notes: Note[], tagIds: string[]): Note[] =>
  tagIds.length === 0 ? notes : notes.filter((n) => tagIds.every((id) => n.tagIds?.includes(id)));

/** タグごとの、付いているメモの数 */
export const countNotesByTag = (notes: Note[]): Map<string, number> => {
  const counts = new Map<string, number>();
  notes.forEach((n) => n.tagIds?.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)));
  return counts;
};
