/**
 * PRD 生成中の段階表示。リクエストは 1 回なので、経過時間で表示を切り替える（目安）。
 */
export const GENERATION_STAGES = [
  { afterSeconds: 0, label: 'メモを読み込み中…' },
  { afterSeconds: 2, label: '要件を整理中…' },
  { afterSeconds: 6, label: 'PRD を書いています…' },
] as const;

export const generationStage = (elapsedSeconds: number): string =>
  [...GENERATION_STAGES].reverse().find((s) => elapsedSeconds >= s.afterSeconds)?.label ?? GENERATION_STAGES[0].label;
