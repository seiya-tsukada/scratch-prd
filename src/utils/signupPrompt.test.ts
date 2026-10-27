import { describe, expect, it } from 'vitest';
import { isSnoozed } from './signupPrompt';
import { SIGNUP_PROMPT } from '../config/app';

const DAY = 24 * 60 * 60 * 1000;

describe('isSnoozed', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');

  it('閉じてから一定期間は出さない', () => {
    expect(isSnoozed(new Date(now - DAY).toISOString(), now)).toBe(true);
    expect(isSnoozed(new Date(now - (SIGNUP_PROMPT.DISMISS_DAYS * DAY - 1)).toISOString(), now)).toBe(true);
  });

  it('期間を過ぎたら、または閉じたことが無ければ出す', () => {
    expect(isSnoozed(new Date(now - SIGNUP_PROMPT.DISMISS_DAYS * DAY).toISOString(), now)).toBe(false);
    expect(isSnoozed(null, now)).toBe(false);
    expect(isSnoozed('broken', now)).toBe(false);
  });
});
