import { describe, expect, it } from 'vitest';
import type { Note } from '../types';
import { getFirstLineText, getNoteDisplayTitle, getNoteShortLabel } from './note';

const note = (title: string, content: string) => ({ title, content }) as Note;

describe('getFirstLineText', () => {
  it('1行目の見出し記号を除く', () => {
    expect(getFirstLineText('## 見出し\n本文')).toBe('見出し');
  });
});

describe('getNoteDisplayTitle', () => {
  it('タイトル → 本文1行目 → 無題のメモ の順', () => {
    expect(getNoteDisplayTitle(' T ', '# x')).toBe('T');
    expect(getNoteDisplayTitle('  ', '# 本文\n2')).toBe('本文');
    expect(getNoteDisplayTitle('', '  \n2')).toBe('無題のメモ');
  });
});

describe('getNoteShortLabel', () => {
  it('タイトルが無ければ本文先頭20文字、それも無ければフォールバック', () => {
    expect(getNoteShortLabel(note('T', 'x'))).toBe('T');
    expect(getNoteShortLabel(note('', 'a'.repeat(30)))).toBe('a'.repeat(20));
    expect(getNoteShortLabel(note('', ''))).toBe('無題');
    expect(getNoteShortLabel(note('', ''), '無題のメモ')).toBe('無題のメモ');
  });
});
