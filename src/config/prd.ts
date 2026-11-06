/**
 * PRD 生成モード・詳細度などの表示定義。
 * Tailwind のクラス名はビルド時に静的解析されるため、必ず完全な文字列で記述する。
 */
import type { PrdDetailLevel, PrdGenerationMode, PrdOpenQuestion, PrdProposal, StoredGenerationMode } from '../types';

export const DEFAULT_GENERATION_MODE: PrdGenerationMode = 'suggest';
export const DEFAULT_DETAIL_LEVEL: PrdDetailLevel = 'standard';

interface PrdModeMeta {
  /** サイドバーなどで使う短いラベル */
  shortLabel: string;
  /** 自動生成されるPRDタイトルの「(xx版)」部分 */
  titleLabel: string;
  /** PRDビューアのバッジ */
  badgeLabel: string;
  badgeClass: string;
  /** 生成モーダルの選択カード */
  cardTitle: string;
  cardDescription: string;
  cardSelectedClass: string;
  cardAccentClass: string;
  recommended?: boolean;
}

export const PRD_MODE_ORDER: PrdGenerationMode[] = ['strict', 'suggest', 'expand'];

export const PRD_MODE_META: Record<PrdGenerationMode, PrdModeMeta> = {
  strict: {
    shortLabel: '厳密',
    titleLabel: '厳密',
    badgeLabel: '厳密モード (Strict)',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    cardTitle: '厳密 (Strict)',
    cardDescription:
      'メモに書かれた事実のみを使用。AIによる勝手な創作や推測を行わず、不足箇所は「未定」「要確認」と明記します。',
    cardSelectedClass: 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500',
    cardAccentClass: 'text-emerald-600 dark:text-emerald-400',
  },
  suggest: {
    shortLabel: '提案',
    titleLabel: '提案',
    badgeLabel: '整理＆提案モード (Suggest)',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
    cardTitle: '整理＆提案 (Suggest)',
    cardDescription:
      '原文の意図を汲んで構造化し、不足部分を明確な「AI提案ラベル」付きで補足します。MVPの推奨設定です。',
    cardSelectedClass: 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500',
    cardAccentClass: 'text-indigo-600 dark:text-indigo-400',
    recommended: true,
  },
  expand: {
    shortLabel: '拡張',
    titleLabel: '仮説拡張',
    badgeLabel: '仮説拡張モード (Expand)',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
    cardTitle: '仮説拡張 (Expand)',
    cardDescription:
      '機能案、ユーザー仮説、KPI候補、リスク、検証方法まで仮説として積極的に提案し、企画を広げます。',
    cardSelectedClass: 'border-purple-500 bg-purple-50/40 dark:bg-purple-950/20 ring-1 ring-purple-500',
    cardAccentClass: 'text-purple-600 dark:text-purple-400',
  },
};

/** 旧データ（PRD セクションのメモ）から変換した PRD の表示 */
export const UNKNOWN_MODE_META: PrdModeMeta = {
  ...PRD_MODE_META.suggest,
  shortLabel: '不明',
  titleLabel: '不明',
  badgeLabel: '生成モード不明（旧データから変換）',
  badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

/** unknown は「不明」、それ以外の未知の値は「整理＆提案」として扱う */
export const getPrdModeMeta = (mode: StoredGenerationMode | undefined): PrdModeMeta =>
  mode === 'unknown' ? UNKNOWN_MODE_META : (mode && PRD_MODE_META[mode]) || PRD_MODE_META.suggest;

/** 再生成に使う生成モード（unknown は既定のモードにする） */
export const toGenerationMode = (mode: StoredGenerationMode | undefined): PrdGenerationMode =>
  mode && mode !== 'unknown' ? mode : DEFAULT_GENERATION_MODE;

export const PRD_DETAIL_LEVEL_ORDER: PrdDetailLevel[] = ['brief', 'standard', 'detailed'];

export const PRD_DETAIL_LEVEL_LABELS: Record<PrdDetailLevel, string> = {
  brief: '簡易',
  standard: '標準',
  detailed: '詳細',
};

/** 未知の値は「標準」として扱う */
export const getDetailLevelLabel = (level: PrdDetailLevel | undefined): string =>
  (level && PRD_DETAIL_LEVEL_LABELS[level]) || PRD_DETAIL_LEVEL_LABELS.standard;

export const PROPOSAL_IMPACT_LABELS: Record<NonNullable<PrdProposal['impact']>, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const OPEN_QUESTION_URGENCY_LABELS: Record<PrdOpenQuestion['urgency'], string> = {
  critical: '至急確認',
  normal: '通常確認',
};

/** AIコーディングツール向けコピー時に PRD の前に付与するプロンプト */
export const AI_CODING_PROMPT_HEADER = `# Product Requirements Document & Implementation Guide
You are an expert full-stack engineer and software architect.
Implement the following specifications precisely according to the requirements, data model, and constraints below.

## Rules for AI Coding Agent:
1. Treat confirmed facts as hard requirements.
2. Verify all edge cases and error states specified in the PRD.
3. Write clean, modular, type-safe TypeScript code with comprehensive testability.
4. Keep the UI aligned with modern, accessible design standards.

---

`;
