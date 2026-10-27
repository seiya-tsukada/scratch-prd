import {
  API_ENDPOINTS,
  GuestRequest,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  SessionUser,
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

/** Turnstile のトークンと引き換えにゲストを作る（既にセッションがあればそのユーザーが返る） */
export async function createGuest(turnstileToken: string): Promise<SessionUser> {
  const payload: GuestRequest = { turnstileToken };
  const body = await requestJson<MeResponse>(API_ENDPOINTS.AUTH_GUEST, { method: 'POST', body: payload });
  return body.user;
}

export const logout = () => requestJson<void>(API_ENDPOINTS.AUTH_LOGOUT, { method: 'POST' });

/** 今のゲストを登録ユーザーにする（データはそのまま） */
export async function register(payload: RegisterRequest): Promise<SessionUser> {
  return (await requestJson<MeResponse>(API_ENDPOINTS.AUTH_REGISTER, { method: 'POST', body: payload })).user;
}

/** ゲストにデータがあり guestData が無いと ApiError（code: guest_data_exists）になる */
export async function login(payload: LoginRequest): Promise<SessionUser> {
  return (await requestJson<MeResponse>(API_ENDPOINTS.AUTH_LOGIN, { method: 'POST', body: payload })).user;
}

export async function updateDisplayName(displayName: string): Promise<SessionUser> {
  return (await requestJson<MeResponse>(API_ENDPOINTS.ACCOUNT, { method: 'PATCH', body: { displayName } })).user;
}

export const changePassword = (currentPassword: string, newPassword: string) =>
  requestJson<void>(API_ENDPOINTS.ACCOUNT_PASSWORD, { method: 'POST', body: { currentPassword, newPassword } });

/** アカウント（ゲストならこのブラウザのデータ）を削除する。登録ユーザーはパスワードが必要 */
export const deleteAccount = (password?: string) =>
  requestJson<void>(API_ENDPOINTS.ACCOUNT, { method: 'DELETE', body: { password } });
