import { describe, expect, it } from 'vitest';
import type { GeneratePrdRequest } from '../src/config/api';
import { buildRoughNoteErrorFallback, generateMockPrd, structureRoughNoteLocally } from './fallbacks';

const request = (overrides: Partial<GeneratePrdRequest> = {}): GeneratePrdRequest => ({
  projectName: 'Proj',
  mode: 'suggest',
  detailLevel: 'standard',
  notes: [
    { id: 'n1', title: '', content: '## 見出し\n2行目' },
    { id: 'n2', title: 'タイトル', content: 'a\nb' },
  ],
  ...overrides,
});

describe('generateMockPrd', () => {
  it.each([
    ['strict', 0],
    ['suggest', 2],
    ['expand', 4],
  ] as const)('%s モードの提案数は %i 件', (mode, count) => {
    expect(generateMockPrd(request({ mode })).proposals).toHaveLength(count);
  });

  it('strict モードでは提案セクションを出力しない', () => {
    expect(generateMockPrd(request({ mode: 'strict' })).markdown).not.toContain('[PROPOSAL]');
    expect(generateMockPrd(request({ mode: 'suggest' })).markdown).toContain('[PROPOSAL]');
  });

  it('メモごとに FACT を作り、参照メモIDを返す', () => {
    const result = generateMockPrd(request());
    expect(result.sourceNoteIds).toEqual(['n1', 'n2']);
    expect(result.facts.map((f) => f.text)).toEqual(['## 見出し\n2行目', 'タイトル: a b']);
    expect(result.facts[0].sourceNoteTitle).toBe('無題のメモ');
  });

  it('詳細度ラベルとプロジェクト名のフォールバック', () => {
    const md = generateMockPrd(request({ detailLevel: 'brief', projectName: '' })).markdown;
    expect(md).toContain('詳細度: **簡易**');
    expect(md.startsWith('# Idea Workspace — ')).toBe(true);
  });

  it('メモの1行目は見出し記号を除いて背景に載せる', () => {
    expect(generateMockPrd(request()).markdown).toContain('- **無題のメモ**: 見出し');
  });
});

describe('structureRoughNoteLocally', () => {
  it('タイトルが無ければ1行目を見出しにし、箇条書き記号を外して要件化する', () => {
    const result = structureRoughNoteLocally({ title: '', content: '# ログイン\n- メール認証\n• SSO' });
    expect(result.structuredTitle).toBe('ログイン');
    expect(result.structuredContent).toContain('- [ ] メール認証\n- [ ] SSO');
  });

  it('タイトルがあればトリムして使う', () => {
    expect(structureRoughNoteLocally({ title: '  T ', content: 'x' }).structuredTitle).toBe('T');
  });
});

describe('buildRoughNoteErrorFallback', () => {
  it('タイトル未指定なら既定タイトルで本文を包む', () => {
    const result = buildRoughNoteErrorFallback({ content: 'body' });
    expect(result.structuredTitle).toBe('構造化メモ');
    expect(result.structuredContent).toContain('## 1. 概要\nbody');
  });
});
