import { SIGNUP_PROMPT } from '../config/app';

/** 登録の案内を出すきっかけ */
export type SignupPromptTrigger = 'first_prd' | 'note_count' | 'quota';

export const SIGNUP_PROMPT_MESSAGES: Record<SignupPromptTrigger, string> = {
  first_prd: '初めての PRD ができました。',
  note_count: 'メモが増えてきました。',
  quota: '本日の AI の利用上限に達しました。登録すると上限が上がります。',
};

/** ゲストのデータが Cookie に依存していることを正直に伝える文 */
export const GUEST_DATA_NOTICE =
  'ゲストのままだと、ブラウザの Cookie を削除したときや別のブラウザからは、このデータに戻れません。';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 閉じてから一定期間は出さない */
export const isSnoozed = (dismissedAt: string | null, now: number = Date.now()): boolean => {
  const time = dismissedAt ? Date.parse(dismissedAt) : NaN;
  return Number.isFinite(time) && now - time < SIGNUP_PROMPT.DISMISS_DAYS * DAY_MS;
};

/** 閉じた日時はこのブラウザに記録する（表示の利便のためだけ。読めなくても動く） */
export const signupPromptStorage = {
  read(): string | null {
    try {
      return localStorage.getItem(SIGNUP_PROMPT.DISMISSED_AT_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  dismiss(now: Date = new Date()): void {
    try {
      localStorage.setItem(SIGNUP_PROMPT.DISMISSED_AT_STORAGE_KEY, now.toISOString());
    } catch {
      // 保存できなくても動作に影響しない
    }
  },
};
