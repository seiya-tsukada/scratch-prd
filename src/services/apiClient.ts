import {
  API_ENDPOINTS,
  GeneratePrdRequest,
  GeneratePrdResponse,
  QuotaExceededDetail,
  StructureRoughNoteRequest,
  StructureRoughNoteResponse,
} from '../config/api';
import { QUOTA_UPGRADE_EVENT, SESSION_EXPIRED_EVENT } from '../config/app';

/** サーバーが返したエラー。code は detail.code、detail はサーバーが返した detail（あれば） */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly detail?: unknown
  ) {
    super(message);
  }
}

/** サーバーが入力を拒否したときの表示文言（入力上限は画面側でも事前に確認している） */
const STATUS_MESSAGES: Record<number, string> = {
  401: 'セッションの有効期限が切れました。画面の案内に従って再開してください。',
  404: '対象のデータが見つかりませんでした。画面を再読み込みしてください。',
  413: '送信するデータが大きすぎます。メモの数や文字数を減らしてください。',
  422: '入力内容が上限を超えているか、形式が正しくありません。メモの数や文字数を確認してください。',
};

const CODE_MESSAGES: Record<string, string> = {
  invalid_origin: 'このページからのリクエストを受け付けられませんでした。ページを再読み込みしてください。',
  turnstile_failed: 'ボット対策の確認に失敗しました。もう一度お試しください。',
  rate_limited: '短時間にリクエストが集中しています。しばらく待ってからお試しください。',
  limit_exceeded: '保存できる件数の上限に達しました。不要なデータを削除してからお試しください。',
  conflict: '他の画面で先に更新されていました。',
  email_taken: 'このメールアドレスは既に登録されています。ログインしてください。',
  already_registered: 'すでにアカウント登録済みです。',
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
  invalid_password: 'パスワードが正しくありません。',
  not_registered: 'アカウント登録後に利用できます。',
};

const QUOTA_KIND_LABELS: Record<QuotaExceededDetail['kind'], string> = {
  structure: '殴り書きの整形',
  prd: 'PRD生成',
};

const quotaMessage = (detail: QuotaExceededDetail) =>
  `本日の${QUOTA_KIND_LABELS[detail.kind]}の上限（${detail.limit}回）に達しました。明日またお試しください。` +
  (detail.canUpgradeByRegistering ? `アカウント登録すると上限が1日${detail.registeredLimit}回に上がります。` : '');

async function toApiError(response: Response, errorPrefix: string): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;
  const code: string | undefined = typeof detail?.code === 'string' ? detail.code : undefined;

  if (code === 'quota_exceeded') {
    if ((detail as QuotaExceededDetail).canUpgradeByRegistering) {
      window.dispatchEvent(new Event(QUOTA_UPGRADE_EVENT));
    }
    return new ApiError(quotaMessage(detail as QuotaExceededDetail), response.status, code, detail);
  }
  const message =
    (code && CODE_MESSAGES[code]) ?? STATUS_MESSAGES[response.status] ?? `${errorPrefix}: ${response.statusText}`;
  return new ApiError(message, response.status, code, detail);
}

/** Cookie セッション付きで API を呼ぶ。401 のときはセッション切れを画面に知らせる */
export async function requestJson<TResponse>(
  url: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
  errorPrefix = 'サーバーエラー'
): Promise<TResponse> {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (!response.ok) {
    const error = await toApiError(response, errorPrefix);
    if (response.status === 401) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw error;
  }

  if (response.status === 204) return undefined as TResponse;
  return response.json();
}

export const generatePrd = (payload: GeneratePrdRequest) =>
  requestJson<GeneratePrdResponse>(API_ENDPOINTS.GENERATE_PRD, { method: 'POST', body: payload }, 'AI生成サーバーエラー');

export const structureRoughNote = (payload: StructureRoughNoteRequest) =>
  requestJson<StructureRoughNoteResponse>(API_ENDPOINTS.STRUCTURE_ROUGH_NOTE, { method: 'POST', body: payload });
