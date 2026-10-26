import { API_ENDPOINTS, GuestRequest, MeResponse, SessionUser } from '../config/api';
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
