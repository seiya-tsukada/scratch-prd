import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, AlertCircle, RotateCw } from 'lucide-react';
import { APP_NAME, SESSION_EXPIRED_EVENT, TURNSTILE_SITE_KEY } from '../config/app';
import type { SessionUser } from '../config/api';
import { createGuest, fetchCurrentUser } from '../services/session';
import { loadTurnstile } from '../services/turnstile';

type GateStatus = 'checking' | 'verifying' | 'ready' | 'error';

interface SessionContextValue {
  user: SessionUser;
  /** 登録・表示名の変更など、同じユーザーのままの更新に使う */
  setUser: (user: SessionUser) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** GuestGate の内側で、ログイン中のユーザー（ゲストを含む）を取得する */
export const useSession = (): SessionContextValue => {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside GuestGate');
  return value;
};

/**
 * セッションが無ければ Turnstile の確認を経てゲストを作り、セッションができてから子を表示する。
 * 利用中にセッションが切れたら（API が 401）、画面を残したまま確認を重ねて表示する。
 */
export const GuestGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<GateStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const widgetContainer = useRef<HTMLDivElement>(null);

  const enterApp = (sessionUser: SessionUser) => {
    setUser(sessionUser);
    setStatus('ready');
    setHasEnteredApp(true);
  };

  const fail = (message: string) => {
    setError(message);
    setStatus('error');
  };

  const checkSession = useCallback(() => {
    setStatus('checking');
    setError(null);
    fetchCurrentUser()
      .then((current) => (current ? enterApp(current) : setStatus('verifying')))
      .catch(() => fail('サーバーに接続できませんでした。時間をおいて再読み込みしてください。'));
  }, []);

  useEffect(checkSession, [checkSession]);

  useEffect(() => {
    const onExpired = () => setStatus('verifying');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Turnstile を表示し、トークンを受け取ったらゲストを作る
  useEffect(() => {
    if (status !== 'verifying') return;
    if (!TURNSTILE_SITE_KEY) {
      fail('VITE_TURNSTILE_SITE_KEY が設定されていません。');
      return;
    }

    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !widgetContainer.current) return;
        widgetId = turnstile.render(widgetContainer.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => {
            createGuest(token)
              .then(enterApp)
              .catch((e: Error) => fail(e.message));
          },
          'error-callback': () => fail('ボット対策の確認に失敗しました。再読み込みしてお試しください。'),
        });
      })
      .catch((e: Error) => fail(e.message));

    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [status]);

  const app = user && <SessionContext.Provider value={{ user, setUser }}>{children}</SessionContext.Provider>;

  if (status === 'ready') return <>{app}</>;

  const card = (
    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 text-center space-y-4">
      <div className="mx-auto w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
        <ShieldCheck className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          {hasEnteredApp ? 'セッションを再開します' : `${APP_NAME} を準備しています`}
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {status === 'checking' ? '接続を確認しています…' : 'ボットでないことを確認しています。'}
        </p>
      </div>

      {status === 'checking' && <Loader2 className="mx-auto w-5 h-5 animate-spin text-indigo-500" />}
      {status === 'verifying' && <div ref={widgetContainer} className="flex justify-center min-h-16" />}
      {status === 'error' && (
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={checkSession}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>もう一度試す</span>
          </button>
        </div>
      )}
    </div>
  );

  // 利用中のセッション切れなら、編集中の画面を残したまま重ねて表示する
  if (hasEnteredApp) {
    return (
      <>
        {app}
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">{card}</div>
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-zinc-100/50 dark:bg-zinc-950">{card}</div>
  );
};
