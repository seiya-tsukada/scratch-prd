/**
 * メモのタグ。上限と色のキーは backend/app/config.py と同じ値にすること（backend/tests/test_limits_sync.py で検証）。
 * Tailwind のクラス名はビルド時に静的解析されるため、必ず完全な文字列で記述する。
 */
import type { TagColor } from '../types';

export const TAG_LIMITS = {
  MAX_TAGS_PER_PROJECT: 200,
  MAX_TAGS_PER_NOTE: 20,
  MAX_TAG_NAME_CHARS: 50,
} as const;

export const TAG_COLORS = ['gray', 'red', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'] as const;

interface TagColorStyle {
  label: string;
  /** タグのチップ */
  chipClass: string;
  /** 色の選択肢の丸 */
  swatchClass: string;
}

export const TAG_COLOR_STYLES: Record<TagColor, TagColorStyle> = {
  gray: {
    label: 'グレー',
    chipClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    swatchClass: 'bg-zinc-400',
  },
  red: {
    label: '赤',
    chipClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900',
    swatchClass: 'bg-rose-500',
  },
  amber: {
    label: '黄',
    chipClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
    swatchClass: 'bg-amber-500',
  },
  green: {
    label: '緑',
    chipClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
    swatchClass: 'bg-emerald-500',
  },
  teal: {
    label: '青緑',
    chipClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-900',
    swatchClass: 'bg-teal-500',
  },
  blue: {
    label: '青',
    chipClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900',
    swatchClass: 'bg-sky-500',
  },
  indigo: {
    label: '藍',
    chipClass:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-900',
    swatchClass: 'bg-indigo-500',
  },
  purple: {
    label: '紫',
    chipClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900',
    swatchClass: 'bg-purple-500',
  },
  pink: {
    label: 'ピンク',
    chipClass: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-900',
    swatchClass: 'bg-pink-500',
  },
};

/** 色が無いタグの表示 */
export const DEFAULT_TAG_COLOR: TagColor = 'gray';

export const tagChipClass = (color: TagColor | undefined): string =>
  TAG_COLOR_STYLES[color ?? DEFAULT_TAG_COLOR].chipClass;
