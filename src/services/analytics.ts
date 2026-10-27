/**
 * 計測イベント（画面上の操作のみ）。API で起きる出来事（ゲスト作成・メモ作成・PRD 生成・登録など）はサーバー側で記録している。
 * 送信に失敗しても画面の操作は止めない。メモ本文などの個人情報は送らない。
 * イベント名とプロパティは backend/app/services/events.py の CLIENT_EVENTS / EVENT_SCHEMAS と揃えること。
 */
import type { SignupPromptTrigger } from '../utils/signupPrompt';

export type ClientEvent =
  | { name: 'app_opened' }
  | { name: 'prd_copied_for_ai' }
  | { name: 'prd_downloaded' }
  | { name: 'signup_prompt_shown'; properties: { trigger: SignupPromptTrigger } }
  | { name: 'signup_started'; properties: { method: 'password' } }
  | { name: 'onboarding_started' }
  | { name: 'quick_prd_used'; properties: { structured: boolean } };

export const EVENTS_ENDPOINT = '/api/events';

export function track(event: ClientEvent): void {
  try {
    void fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: event.name, properties: 'properties' in event ? event.properties : {} }),
      // ページを離れる直前の操作（ダウンロードなど）でも送り切る
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 計測の失敗で画面を止めない
  }
}
