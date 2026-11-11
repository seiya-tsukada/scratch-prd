import { describe, expect, it } from 'vitest';
import { generationStage } from './generationStage';

describe('generationStage', () => {
  it('経過時間で段階を進める', () => {
    expect(generationStage(0)).toBe('メモを読み込み中…');
    expect(generationStage(1.9)).toBe('メモを読み込み中…');
    expect(generationStage(2)).toBe('要件を整理中…');
    expect(generationStage(30)).toBe('PRD を書いています…');
  });
});

