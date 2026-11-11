import {
  API_ENDPOINTS,
  LoginRequest,
  LoginVerifyRequest,
  MeResponse,
  RegisterRequest,
  SessionUser,
  VerificationStarted,
  VerifyCodeRequest,
} from '../config/api';
import { ApiError, requestJson } from './apiClient';

/** ログイン中のユーザー。セッションが無ければ null */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  const response = await fetch(API_ENDPOINTS.AUTH_ME, { credentials: 'same-origin' });
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError('サーバーに接続できませんでした。', response.status);
  const body: MeResponse = await response.json();
  return body.user;
}

/** ゲストを作る（既にセッションがあればそのユーザーが返る） */
export async function createGuest(): Promise<SessionUser> {
  const body = await requestJson<MeResponse>(API_ENDPOINTS.AUTH_GUEST, { method: 'POST' });
  return body.user;
}

export const logout = () => requestJson<void>(API_ENDPOINTS.AUTH_LOGOUT, { method: 'POST' });

/** 登録の 1 段階目。確認コードをメールで送る（再送も同じ呼び出し） */
export const startRegister = (payload: RegisterRequest) =>
  requestJson<VerificationStarted>(API_ENDPOINTS.AUTH_REGISTER, { method: 'POST', body: payload });

/** 登録の 2 段階目。今のゲストを登録ユーザーにする（データはそのまま） */
export async function verifyRegister(payload: VerifyCodeRequest): Promise<SessionUser> {
  return (await requestJson<MeResponse>(API_ENDPOINTS.AUTH_REGISTER_VERIFY, { method: 'POST', body: payload })).user;
}

/** ログインの 1 段階目。メールアドレスとパスワードが正しければ確認コードをメールで送る（再送も同じ呼び出し） */
export const startLogin = (payload: LoginRequest) =>
  requestJson<VerificationStarted>(API_ENDPOINTS.AUTH_LOGIN, { method: 'POST', body: payload });

/** ログインの 2 段階目。ゲストにデータがあり guestData が無いと ApiError（code: guest_data_exists）になる */
export async function verifyLogin(payload: LoginVerifyRequest): Promise<SessionUser> {
  return (await requestJson<MeResponse>(API_ENDPOINTS.AUTH_LOGIN_VERIFY, { method: 'POST', body: payload })).user;
}

export async function updateDisplayName(displayName: string): Promise<SessionUser> {
  return (await requestJson<MeResponse>(API_ENDPOINTS.ACCOUNT, { method: 'PATCH', body: { displayName } })).user;
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  requestJson<void>(API_ENDPOINTS.ACCOUNT_PASSWORD, { method: 'POST', body: { currentPassword, newPassword } });

/** アカウント（ゲストならこのブラウザのデータ）を削除する。登録ユーザーはパスワードが必要 */
export const deleteAccount = (password?: string) =>
  requestJson<void>(API_ENDPOINTS.ACCOUNT, { method: 'DELETE', body: { password } });
