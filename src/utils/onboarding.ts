import type { SessionUser } from '../config/api';

/** 初回の案内の例文（殴り書きの雰囲気が分かるもの） */
export const ONBOARDING_EXAMPLE = `ペットの散歩記録アプリ
- 散歩した時間と距離を記録したい
- 家族で共有できるといい（誰が散歩したか分かる）
- 雨の日は室内遊びの記録も
- 散歩を忘れないよう通知？
- まずは自分用。iPhone で使いたい`;

interface OnboardingContext {
  user: SessionUser;
  hasProject: boolean;
  /** 旧データの取り込み確認など、先に出すダイアログがある */
  hasPendingDialog: boolean;
  /** このページで閉じた */
  dismissed: boolean;
}

/** 初回の案内を出すか。案内を終えた（または飛ばした）ユーザーには出さない */
export const shouldShowOnboarding = ({ user, hasProject, hasPendingDialog, dismissed }: OnboardingContext): boolean =>
  !user.onboardingDone && hasProject && !hasPendingDialog && !dismissed;
