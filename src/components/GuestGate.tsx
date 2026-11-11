import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, RotateCw, Sparkles, ShieldCheck, LogIn, ArrowRight } from 'lucide-react';
import { APP_NAME, SESSION_EXPIRED_EVENT } from '../config/app';
import type { SessionUser } from '../config/api';
import { createGuest, fetchCurrentUser } from '../services/session';
import { GUEST_DATA_NOTICE } from '../utils/signupPrompt';
import { AuthDialog, AuthMode } from './AuthDialog';

/** welcome はセッションが無く、アカウントを作るか・作らずに始めるかを選んでもらう状態 */
type GateStatus = 'checking' | 'welcome' | 'creating' | 'ready' | 'error';

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
 * セッションが無ければ、最初に「アカウントを作る / ログイン / 作らずに始める」を選んでもらい、
 * セッションができてから子（ワークスペース）を表示する。
 * 利用中にセッションが切れたら（API が 401）、画面を残したまま同じ選択を重ねて表示する。
 */
export const GuestGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<GateStatus>('checking');
  const [error, setError] = useState<string | null>(null);
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  // 一度ワークスペースに入ったユーザー。コールバックから最新の値を見るため ref に持つ
  const enteredUserId = useRef<string | null>(null);
  // 登録の直前に作ったゲスト。登録に失敗してダイアログを閉じたら、このゲストのまま始める
  const preparedGuest = useRef<SessionUser | null>(null);

  const enterApp = useCallback((sessionUser: SessionUser) => {
    // セッション切れの後に別のユーザーで入り直したら、前のユーザーの画面を残さないよう読み直す
    if (enteredUserId.current && enteredUserId.current !== sessionUser.id) {
      window.location.reload();
      return;
    }
    enteredUserId.current = sessionUser.id;
    setUser(sessionUser);
    setAuthMode(null);
    setStatus('ready');
    setHasEnteredApp(true);
  }, []);

  const fail = (message: string) => {
    setError(message);
    setStatus('error');
  };

  const checkSession = useCallback(() => {
    setStatus('checking');
    setError(null);
    fetchCurrentUser()
      .then((current) => (current ? enterApp(current) : setStatus('welcome')))
      .catch(() => fail('サーバーに接続できませんでした。時間をおいて再読み込みしてください。'));
  }, [enterApp]);

  useEffect(checkSession, [checkSession]);

  useEffect(() => {
    const onExpired = () => setStatus('welcome');
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  /** アカウントを作らずに始める（ゲストを作ってサンプルを複製する） */
  const startAsGuest = () => {
    setStatus('creating');
    setError(null);
    createGuest()
      .then(enterApp)
      .catch((e: Error) => fail(e.message));
  };

  const app = user && <SessionContext.Provider value={{ user, setUser }}>{children}</SessionContext.Provider>;

  if (status === 'ready') return <>{app}</>;

  const welcome = (
    <div className="space-y-4">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAuthMode('register')}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>アカウントを作成して始める</span>
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <LogIn className="w-4 h-4" />
          <span>ログイン</span>
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span>または</span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={startAsGuest}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
        >
          <span>アカウントを作らずに始める</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          すべての機能を使えます（AI の利用上限だけ少なめです）。あとから登録すると、データはそのまま引き継がれます。
          {GUEST_DATA_NOTICE}
        </p>
      </div>
    </div>
  );

  const card = (
    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
      <div className="text-center space-y-3">
        <div className="mx-auto w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {hasEnteredApp ? 'セッションが切れました' : `${APP_NAME} へようこそ`}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {status === 'checking'
              ? '接続を確認しています…'
              : status === 'creating'
                ? '準備しています…'
                : hasEnteredApp
                  ? 'もう一度ログインするか、新しく始めてください。'
                  : '思いつきのメモを、開発に使える PRD へ育てるワークスペースです。'}
          </p>
        </div>
      </div>

      {status === 'welcome' && welcome}
      {(status === 'checking' || status === 'creating') && (
        <Loader2 className="mx-auto w-5 h-5 animate-spin text-indigo-500" />
      )}
      {status === 'error' && (
        <div className="space-y-3 text-center">
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

  const authDialog = authMode && (
    <AuthDialog
      initialMode={authMode}
      isGuest
      // 登録はゲストを昇格させる API なので、先にゲスト（サンプル入り）を作ってから登録する
      prepareRegister={async () => {
        preparedGuest.current = await createGuest();
      }}
      onClose={() => {
        // 選択画面に戻すと、ログイン時にサンプルだけのゲストの統合確認が出てしまうので、そのまま始める
        if (preparedGuest.current) enterApp(preparedGuest.current);
        else setAuthMode(null);
      }}
      onRegistered={enterApp}
      onLoggedIn={() => {
        setAuthMode(null);
        checkSession();
      }}
    />
  );

  // 利用中のセッション切れなら、編集中の画面を残したまま重ねて表示する
  if (hasEnteredApp) {
    return (
      <>
        {app}
        {!authMode && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">{card}</div>
        )}
        {authDialog}
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center p-4 bg-zinc-100/50 dark:bg-zinc-950">
      {!authMode && card}
      {authDialog}
    </div>
  );
};
