import { describe, expect, it } from 'vitest';
import { generationStage } from './generationStage';
import { shouldShowOnboarding } from './onboarding';

describe('generationStage', () => {
  it('経過時間で段階を進める', () => {
    expect(generationStage(0)).toBe('メモを読み込み中…');
    expect(generationStage(1.9)).toBe('メモを読み込み中…');
    expect(generationStage(2)).toBe('要件を整理中…');
    expect(generationStage(30)).toBe('PRD を書いています…');
  });
});

describe('shouldShowOnboarding', () => {
  const base = {
    user: { id: 'u', isGuest: true, onboardingDone: false },
    hasProject: true,
    hasPendingDialog: false,
    dismissed: false,
  };

  it('初めてのユーザーに出す', () => {
    expect(shouldShowOnboarding(base)).toBe(true);
  });

  it('終えた・閉じた・プロジェクトが無い・先に出すダイアログがあるときは出さない', () => {
    expect(shouldShowOnboarding({ ...base, user: { ...base.user, onboardingDone: true } })).toBe(false);
    expect(shouldShowOnboarding({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowOnboarding({ ...base, hasProject: false })).toBe(false);
    expect(shouldShowOnboarding({ ...base, hasPendingDialog: true })).toBe(false);
  });
});
