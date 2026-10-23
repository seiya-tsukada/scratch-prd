import { describe, expect, it } from 'vitest';
import { buildGeneratePrdPrompt, buildStructureRoughNotePrompt } from './prompts';
import { EXISTING_PRD_CONTEXT_MAX_CHARS } from './config';

describe('buildGeneratePrdPrompt', () => {
  const base = {
    projectName: 'Proj',
    mode: 'strict' as const,
    detailLevel: 'brief' as const,
    notes: [{ id: 'n1', title: '', content: 'body' }],
  };

  it('モードと詳細度の指示、メモ内容を含む', () => {
    const prompt = buildGeneratePrdPrompt(base);
    expect(prompt).toContain('【Mode A: 厳密 (Strict)】');
    expect(prompt).toContain('Detail: 要点を絞ったコンパクトなPRD');
    expect(prompt).toContain('[Note #1] ID: n1 | Section: General | Title: (無題)\nContent:\nbody');
  });

  it('モード・詳細度が未指定なら suggest / standard を使う', () => {
    const prompt = buildGeneratePrdPrompt({ ...base, mode: undefined as never, detailLevel: undefined as never });
    expect(prompt).toContain('【Mode B: 整理＆提案 (Suggest) - 推奨】');
    expect(prompt).toContain('Detail: 実践的で明確な標準PRD');
  });

  it('既存PRDは上限文字数まで切り詰めて含める', () => {
    const existingPrd = 'x'.repeat(EXISTING_PRD_CONTEXT_MAX_CHARS + 50);
    const prompt = buildGeneratePrdPrompt({ ...base, existingPrd });
    expect(prompt).toContain(`Previous PRD Reference:\n${'x'.repeat(EXISTING_PRD_CONTEXT_MAX_CHARS)}\n`);
    expect(prompt).not.toContain('x'.repeat(EXISTING_PRD_CONTEXT_MAX_CHARS + 1));
  });
});

describe('buildStructureRoughNotePrompt', () => {
  it('プロジェクト名・タイトルが無ければ既定値を使う', () => {
    const prompt = buildStructureRoughNotePrompt({ content: 'memo' });
    expect(prompt).toContain('Project: Idea Workspace');
    expect(prompt).toContain('Raw scribble title: (無題)');
    expect(prompt).toContain('"""\nmemo\n"""');
  });
});
