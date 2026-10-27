import { describe, expect, it } from 'vitest';
import {
  answeredDecisions,
  buildPreviousPrd,
  decisionAnswer,
  decisionContent,
  decisionTitle,
  diffPrd,
  extractHeadings,
  isEmptyDiff,
} from './prdLoop';
import { AI_INPUT_LIMITS } from '../config/api';
import type { Note, PrdDocument } from '../types';

const note = (title: string, content: string): Note => ({
  id: title,
  sectionId: 's',
  projectId: 'p',
  userId: 'u',
  title,
  content,
  position: 0,
  createdAt: '',
  updatedAt: '',
});

const prd = (overrides: Partial<PrdDocument> = {}): PrdDocument => ({
  id: 'prd',
  projectId: 'p',
  userId: 'u',
  title: 'PRD',
  content: '# タイトル\n本文\n## 1. 概要\n- a\n### 1.1 詳細 ##\n#### 深すぎる見出し\n#ハッシュタグ',
  generationMode: 'suggest',
  detailLevel: 'standard',
  sourceNoteIds: [],
  facts: [{ id: 'f1', text: '事実1' }],
  proposals: [],
  openQuestions: [
    { id: 'q1', question: '対象 OS は？', context: 'iOS のみか', urgency: 'normal' },
    { id: 'q2', question: '料金は？', context: '', urgency: 'critical' },
  ],
  contradictions: [],
  version: 1,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('決定事項メモ', () => {
  it('タイトルと本文の形式、回答の取り出し', () => {
    const n = note(decisionTitle('対象 OS は？'), decisionContent('対象 OS は？', '  iOS のみ '));
    expect(n.title).toBe('決定: 対象 OS は？');
    expect(decisionAnswer(n)).toBe('iOS のみ');
    expect(decisionAnswer(note('x', '形式なしの回答'))).toBe('形式なしの回答');
  });

  it('長い質問でもタイトルは上限内', () => {
    expect(decisionTitle('あ'.repeat(500)).length).toBe(AI_INPUT_LIMITS.MAX_TITLE_CHARS);
  });

  it('回答済みの未決事項だけを返す（空の回答は未回答）', () => {
    const notes = [
      note(decisionTitle('対象 OS は？'), decisionContent('対象 OS は？', 'iOS のみ')),
      note(decisionTitle('料金は？'), decisionContent('料金は？', '')),
    ];
    expect(answeredDecisions(prd(), notes).map((d) => [d.question, d.answer])).toEqual([['対象 OS は？', 'iOS のみ']]);
  });
});

describe('buildPreviousPrd', () => {
  it('見出し構成・事実・未決事項・決定事項をまとめる', () => {
    const summary = buildPreviousPrd(prd(), [{ question: '対象 OS は？', answer: 'iOS のみ' }]);
    expect(summary.headings).toEqual(['タイトル', '1. 概要', '1.1 詳細']);
    expect(summary.facts).toEqual(['事実1']);
    expect(summary.openQuestions).toEqual([
      { question: '対象 OS は？', context: 'iOS のみか' },
      { question: '料金は？', context: '' },
    ]);
    expect(summary.decisions).toEqual([{ question: '対象 OS は？', answer: 'iOS のみ' }]);
  });

  it('件数と文字数の上限に収める', () => {
    const many = Array.from({ length: AI_INPUT_LIMITS.MAX_PREVIOUS_ITEMS + 5 }, (_, i) => ({ id: `${i}`, text: 'x'.repeat(2000) }));
    const summary = buildPreviousPrd(prd({ facts: many }), []);
    expect(summary.facts).toHaveLength(AI_INPUT_LIMITS.MAX_PREVIOUS_ITEMS);
    expect(summary.facts[0]).toHaveLength(AI_INPUT_LIMITS.MAX_PREVIOUS_ITEM_CHARS);
  });

  it('見出しの取り出しは # 〜 ### のみ', () => {
    expect(extractHeadings('## A\n####  B\nC\n#  D  ')).toEqual(['A', 'D']);
  });
});

describe('diffPrd', () => {
  it('事実・提案・未決事項の追加と削除', () => {
    const older = prd();
    const newer = prd({
      facts: [{ id: 'f1', text: '事実1' }, { id: 'f2', text: '対象は iOS のみ' }],
      proposals: [{ id: 'p', category: 'c', title: '新提案', description: '' }],
      openQuestions: [{ id: 'q2', question: '料金は？', context: '', urgency: 'critical' }],
    });
    expect(diffPrd(older, newer)).toEqual({
      factsAdded: ['対象は iOS のみ'],
      factsRemoved: [],
      proposalsAdded: ['新提案'],
      proposalsRemoved: [],
      questionsAdded: [],
      questionsResolved: ['対象 OS は？'],
    });
    expect(isEmptyDiff(diffPrd(older, older))).toBe(true);
  });
});
