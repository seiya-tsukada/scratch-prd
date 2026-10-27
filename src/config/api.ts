/**
 * AI・認証 API の定義（Workspace API の型は services/apiWorkspaceRepository.ts）。
 * Python 側（backend/app/models/*.py）とキー名・型を一致させること。
 */
import type {
  PrdContradiction,
  PrdDetailLevel,
  PrdFact,
  PrdGenerationMode,
  PrdOpenQuestion,
  PrdProposal,
} from '../types';

/** AI への入力上限。backend/app/config.py と同じ値にすること（backend/tests/test_limits_sync.py で検証） */
export const AI_INPUT_LIMITS = {
  MAX_NOTES: 50,
  MAX_NOTE_CONTENT_CHARS: 20_000,
  MAX_TOTAL_NOTE_CHARS: 100_000,
  MAX_ROUGH_NOTE_CHARS: 20_000,
  MAX_TITLE_CHARS: 200,
  MAX_EXISTING_PRD_CHARS: 50_000,
} as const;

/** AI ではなく内蔵ジェネレータで応答した理由 */
export type FallbackReason = 'no_api_key' | 'ai_error' | 'invalid_response';

export const FALLBACK_REASON_MESSAGES: Record<FallbackReason, string> = {
  no_api_key: 'AI（Gemini）が未設定のため、内蔵ジェネレータで作成しました。',
  ai_error: 'AIサービスとの通信に失敗したため、内蔵ジェネレータで作成しました。',
  invalid_response: 'AIの応答を解釈できなかったため、内蔵ジェネレータで作成しました。',
};

/** 内蔵ジェネレータで応答した場合は usedFallback が true になる */
export interface AiResultMeta {
  usedFallback: boolean;
  fallbackReason?: FallbackReason;
}

export const API_ENDPOINTS = {
  GENERATE_PRD: '/api/generate-prd',
  STRUCTURE_ROUGH_NOTE: '/api/structure-rough-note',
  HEALTH: '/api/health',
  AUTH_GUEST: '/api/auth/guest',
  AUTH_ME: '/api/auth/me',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_REGISTER: '/api/auth/register',
  AUTH_LOGIN: '/api/auth/login',
  ACCOUNT: '/api/account',
  ACCOUNT_PASSWORD: '/api/account/password',
} as const;

/** パスワードの条件（backend/app/config.py と同じ） */
export const PASSWORD_RULES = { MIN_CHARS: 10, MAX_CHARS: 128 } as const;

/** ログイン中のユーザー（backend/app/models/auth.py の MeUser） */
export interface SessionUser {
  id: string;
  isGuest: boolean;
  email?: string;
  displayName?: string;
}

export interface MeResponse {
  user: SessionUser;
}

export interface GuestRequest {
  turnstileToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

/** 今のゲストにデータがあるときは guestData で統合（merge）か破棄（discard）を指定する */
export interface LoginRequest {
  email: string;
  password: string;
  guestData?: 'merge' | 'discard';
}

/** ログイン時、今のゲストにデータがあった（409） */
export interface GuestDataExistsDetail {
  code: 'guest_data_exists';
  projects: number;
  notes: number;
}

/** API が返すエラー（detail.code）。入力検証エラー（422）は detail が配列 */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'invalid_origin'
  | 'turnstile_failed'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'email_taken'
  | 'already_registered'
  | 'invalid_credentials'
  | 'invalid_password'
  | 'guest_data_exists';

export interface QuotaExceededDetail {
  code: 'quota_exceeded';
  kind: 'structure' | 'prd';
  limit: number;
  registeredLimit: number;
  canUpgradeByRegistering: boolean;
}

export interface PrdNoteInput {
  id: string;
  title: string;
  content: string;
  sectionName?: string;
}

export interface GeneratePrdRequest {
  projectName: string;
  mode: PrdGenerationMode;
  detailLevel: PrdDetailLevel;
  notes: PrdNoteInput[];
  existingPrd?: string;
}

export interface GeneratePrdResponse extends AiResultMeta {
  markdown: string;
  facts: PrdFact[];
  proposals: PrdProposal[];
  openQuestions: PrdOpenQuestion[];
  contradictions: PrdContradiction[];
  sourceNoteIds: string[];
}

export interface StructureRoughNoteRequest {
  title?: string;
  content: string;
  projectName?: string;
}

export interface StructureRoughNoteResponse extends AiResultMeta {
  structuredTitle: string;
  structuredContent: string;
}
