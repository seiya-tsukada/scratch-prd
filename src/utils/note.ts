import type { Note } from '../types';
import { NOTE_LABEL_PREVIEW_LENGTH, UNTITLED_NOTE_LABEL, UNTITLED_SHORT_LABEL } from '../config/app';

/** 本文の1行目から Markdown 見出し記号を除いた文字列 */
export const getFirstLineText = (content: string): string =>
  content.split('\n')[0].replace(/^#+\s*/, '');

/** タイトル → 本文1行目 → 「無題のメモ」の順で表示名を決める */
export const getNoteDisplayTitle = (title: string, content: string): string =>
  title.trim() || getFirstLineText(content).trim() || UNTITLED_NOTE_LABEL;

/** ドロップダウンなど狭い場所向け: タイトル → 本文先頭 → フォールバック */
export const getNoteShortLabel = (note: Note, fallback: string = UNTITLED_SHORT_LABEL): string =>
  note.title || note.content.slice(0, NOTE_LABEL_PREVIEW_LENGTH) || fallback;
