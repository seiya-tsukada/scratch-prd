import type { PaneCount, PaneInfo } from '../types';

export const APP_NAME = 'Idea Workspace';

/** プロジェクト名が取得できないときの表示名 */
export const FALLBACK_PROJECT_NAME = 'アイデア';

/** タイトル未設定メモの表示名 */
export const UNTITLED_NOTE_LABEL = '無題のメモ';
export const UNTITLED_SHORT_LABEL = '無題';

/** メモ一覧などでタイトル代わりに表示する本文の文字数 */
export const NOTE_LABEL_PREVIEW_LENGTH = 20;

/** 新規メモの保存先として優先するセクション名のキーワード（小文字比較） */
export const INBOX_SECTION_KEYWORD = 'inbox';

/** セクションが見つからないときのフォールバックID */
export const FALLBACK_SECTION_ID = 'sec-default';

/** 各種タイミング (ms) */
export const TIMING = {
  NOTE_AUTOSAVE_DEBOUNCE_MS: 300,
  PREFERENCES_SAVE_DEBOUNCE_MS: 400,
  COPY_FEEDBACK_MS: 2000,
  STRUCTURE_APPLY_CLOSE_DELAY_MS: 800,
  EDITOR_REFOCUS_DELAY_MS: 10,
  GENERATION_TIMER_INTERVAL_MS: 100,
} as const;

/** マルチペイン */
export const MAX_PANES = 4;
export const DEFAULT_PANE_COUNT: PaneCount = 2;
export const PANE_IDS = Array.from({ length: MAX_PANES }, (_, i) => `pane-${i}`);
export const DEFAULT_ACTIVE_PANE_ID = PANE_IDS[0];

export const createEmptyPanes = (): PaneInfo[] =>
  PANE_IDS.map((id) => ({ id, noteId: null }));

/** キーボードショートカット（Cmd/Ctrl と組み合わせる） */
export const QUICK_CAPTURE_SHORTCUT_KEY = 'n';

export const DATE_LOCALE = 'ja-JP';

/** Cloudflare Turnstile（ゲスト作成時の bot 対策）。公開値なので VITE_ で渡す */
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** セッションが切れた（API が 401 を返した）ことを知らせるウィンドウイベント */
export const SESSION_EXPIRED_EVENT = 'idea-workspace:session-expired';
