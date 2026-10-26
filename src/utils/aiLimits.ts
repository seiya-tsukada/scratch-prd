import { AI_INPUT_LIMITS } from '../config/api';

const format = (n: number) => n.toLocaleString();

/** PRD 生成に渡すメモがサーバーの入力上限を超えていれば、その理由を返す */
export const getPrdInputLimitError = (notes: { content: string }[]): string | null => {
  if (notes.length > AI_INPUT_LIMITS.MAX_NOTES) {
    return `一度に選べるメモは${format(AI_INPUT_LIMITS.MAX_NOTES)}件までです（${format(notes.length)}件選択中）。`;
  }
  const tooLong = notes.filter((n) => n.content.length > AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS).length;
  if (tooLong > 0) {
    return `1件あたり${format(AI_INPUT_LIMITS.MAX_NOTE_CONTENT_CHARS)}文字を超えるメモが${tooLong}件あります。`;
  }
  const total = notes.reduce((sum, n) => sum + n.content.length, 0);
  if (total > AI_INPUT_LIMITS.MAX_TOTAL_NOTE_CHARS) {
    return `選択したメモの合計が${format(AI_INPUT_LIMITS.MAX_TOTAL_NOTE_CHARS)}文字を超えています（約${format(total)}文字）。`;
  }
  return null;
};
