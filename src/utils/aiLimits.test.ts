import { describe, expect, it } from 'vitest';
import { getPrdInputLimitError } from './aiLimits';
import { AI_INPUT_LIMITS } from '../config/api';

const note = (length: number) => ({ content: 'x'.repeat(length) });

describe('getPrdInputLimitError', () => {
  it('上限以内なら null', () => {
    const notes = Array.from({ length: AI_INPUT_LIMITS.MAX_TOTAL_NOTE_CHARS / AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS }, () =>
      note(AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS)
    );
    expect(getPrdInputLimitError(notes)).toBeNull();
  });

  it('件数・1件あたりの文字数・合計文字数の超過を検出する', () => {
    expect(getPrdInputLimitError(Array.from({ length: AI_INPUT_LIMITS.MAX_NOTES + 1 }, () => note(1)))).toContain('件まで');
    expect(getPrdInputLimitError([note(AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS + 1)])).toContain('1件あたり');
    const overTotal = Array.from(
      { length: AI_INPUT_LIMITS.MAX_TOTAL_NOTE_CHARS / AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS + 1 },
      () => note(AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS)
    );
    expect(getPrdInputLimitError(overTotal)).toContain('合計');
  });
});
