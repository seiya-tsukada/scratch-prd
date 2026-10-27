/**
 * 「PRD を育てる」流れ（Phase 8）: 未決事項への回答（決定事項メモ）、再生成時の前回 PRD の要約、版の差分。
 */
import { AI_INPUT_LIMITS, PreviousPrd } from '../config/api';
import type { Note, PrdDocument, PrdFact, PrdOpenQuestion, PrdProposal } from '../types';

/** 回答を保存するセクション（無ければ作る） */
export const DECISION_SECTION_NAME = '決定事項 (Decisions)';
const DECISION_TITLE_PREFIX = '決定: ';
const ANSWER_HEADING = '## 回答';

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);
const clipItem = (text: string) => clip(text, AI_INPUT_LIMITS.MAX_PREVIOUS_ITEM_CHARS);

/** 回答メモのタイトル（このタイトルで回答済みかを判定する） */
export const decisionTitle = (question: string): string =>
  clip(`${DECISION_TITLE_PREFIX}${question}`, AI_INPUT_LIMITS.MAX_TITLE_CHARS);

export const decisionContent = (question: string, answer: string): string =>
  `## 質問\n${question}\n\n${ANSWER_HEADING}\n${answer.trim()}`;

/** 回答メモから回答部分を取り出す（形式が崩れていれば本文全体） */
export const decisionAnswer = (note: Note): string => {
  const index = note.content.indexOf(`${ANSWER_HEADING}\n`);
  return (index === -1 ? note.content : note.content.slice(index + ANSWER_HEADING.length + 1)).trim();
};

export const findDecisionNote = (notes: Note[], question: string): Note | undefined =>
  notes.find((n) => n.title === decisionTitle(question));

/** PRD の未決事項のうち、回答済みのもの */
export const answeredDecisions = (prd: PrdDocument, notes: Note[]): { question: string; answer: string; note: Note }[] =>
  (prd.openQuestions ?? []).flatMap((q) => {
    const note = findDecisionNote(notes, q.question);
    const answer = note ? decisionAnswer(note) : '';
    return note && answer ? [{ question: q.question, answer, note }] : [];
  });

/** Markdown の見出し（# 〜 ###）を順に取り出す */
export const extractHeadings = (markdown: string): string[] =>
  markdown
    .split('\n')
    .map((line) => line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/)?.[1])
    .filter((heading): heading is string => Boolean(heading));

/** 再生成時に渡す前回の PRD の要約。本文を切り詰める代わりに、構成と要点を上限内で渡す */
export const buildPreviousPrd = (prd: PrdDocument, decisions: { question: string; answer: string }[]): PreviousPrd => {
  const limit = <T>(items: T[]) => items.slice(0, AI_INPUT_LIMITS.MAX_PREVIOUS_ITEMS);
  return {
    title: clip(prd.title, AI_INPUT_LIMITS.MAX_TITLE_CHARS),
    headings: limit(extractHeadings(prd.content).map(clipItem)),
    facts: limit((prd.facts ?? []).map((f) => clipItem(f.text))),
    openQuestions: limit(
      (prd.openQuestions ?? []).map((q) => ({ question: clipItem(q.question), context: clipItem(q.context ?? '') }))
    ),
    decisions: limit(decisions.map((d) => ({ question: clipItem(d.question), answer: clipItem(d.answer) }))),
  };
};

interface PrdContent {
  facts: PrdFact[];
  proposals: PrdProposal[];
  openQuestions: PrdOpenQuestion[];
}

export interface PrdDiff {
  factsAdded: string[];
  factsRemoved: string[];
  proposalsAdded: string[];
  proposalsRemoved: string[];
  questionsAdded: string[];
  questionsResolved: string[];
}

const difference = (a: string[], b: string[]) => a.filter((item) => !b.includes(item));

/** 版の差分（older → newer）。要件の比較は事実・提案・未決事項の文言で行う */
export const diffPrd = (older: PrdContent, newer: PrdContent): PrdDiff => {
  const facts = (p: PrdContent) => (p.facts ?? []).map((f) => f.text);
  const proposals = (p: PrdContent) => (p.proposals ?? []).map((x) => x.title);
  const questions = (p: PrdContent) => (p.openQuestions ?? []).map((q) => q.question);
  return {
    factsAdded: difference(facts(newer), facts(older)),
    factsRemoved: difference(facts(older), facts(newer)),
    proposalsAdded: difference(proposals(newer), proposals(older)),
    proposalsRemoved: difference(proposals(older), proposals(newer)),
    questionsAdded: difference(questions(newer), questions(older)),
    questionsResolved: difference(questions(older), questions(newer)),
  };
};

export const isEmptyDiff = (diff: PrdDiff): boolean => Object.values(diff).every((items) => items.length === 0);
