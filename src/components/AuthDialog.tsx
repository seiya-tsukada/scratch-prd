import React, { useState } from 'react';
import { X, Loader2, AlertCircle, ShieldCheck, LogIn } from 'lucide-react';
import { GuestDataExistsDetail, PASSWORD_RULES, SessionUser } from '../config/api';
import { ApiError } from '../services/apiClient';
import { login, register } from '../services/session';
import { GUEST_DATA_NOTICE } from '../utils/signupPrompt';

export type AuthMode = 'register' | 'login';

interface AuthDialogProps {
  initialMode: AuthMode;
  isGuest: boolean;
  onClose: () => void;
  /** 登録後も同じユーザー・同じデータのまま */
  onRegistered: (user: SessionUser) => void;
  /** 別のユーザーに切り替わったので、ワークスペースを読み直す */
  onLoggedIn: () => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500';

/** メールアドレス + パスワードの登録・ログイン。ゲストにデータがあれば統合するかを確認する */
export const AuthDialog: React.FC<AuthDialogProps> = ({ initialMode, isGuest, onClose, onRegistered, onLoggedIn }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [guestData, setGuestData] = useState<GuestDataExistsDetail | null>(null);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'guest_data_exists') {
        setGuestData(e.detail as GuestDataExistsDetail);
      } else {
        setError((e as Error).message || '処理に失敗しました。');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('確認用のパスワードが一致しません。');
        return;
      }
      void run(async () => onRegistered(await register({ email, password, displayName: displayName || undefined })));
    } else {
      void run(async () => {
        await login({ email, password });
        onLoggedIn();
      });
    }
  };

  const resolveGuestData = (choice: 'merge' | 'discard') => {
    if (
      choice === 'discard' &&
      !window.confirm('このブラウザのデータを削除してからログインします。削除したデータは元に戻せません。よろしいですか？')
    ) {
      return;
    }
    void run(async () => {
      await login({ email, password, guestData: choice });
      onLoggedIn();
    });
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {mode === 'register' ? <ShieldCheck className="w-4 h-4 text-indigo-500" /> : <LogIn className="w-4 h-4 text-indigo-500" />}
            <span>{guestData ? 'このブラウザのデータ' : mode === 'register' ? 'アカウント登録' : 'ログイン'}</span>
          </h2>
          <button type="button" onClick={onClose} disabled={isBusy} className="p-1 text-zinc-400 hover:text-zinc-700" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {guestData ? (
          <div className="space-y-3 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              このブラウザには、ゲストとして作成したデータ（{guestData.projects}プロジェクト・メモ{guestData.notes}
              件。最初に用意されたサンプルを含みます）があります。ログインするアカウントに統合しますか？
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => resolveGuestData('merge')}
                disabled={isBusy}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              >
                {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>アカウントに統合してログイン</span>
              </button>
              <button
                type="button"
                onClick={() => resolveGuestData('discard')}
                disabled={isBusy}
                className="px-4 py-2 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
              >
                統合せずに削除してログイン
              </button>
              <button
                type="button"
                onClick={() => setGuestData(null)}
                disabled={isBusy}
                className="px-4 py-2 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                戻る
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && isGuest && (
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                今のデータはそのままアカウントに引き継がれます。{GUEST_DATA_NOTICE}
              </p>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">メールアドレス</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">パスワード</span>
              <input
                type="password"
                required
                minLength={mode === 'register' ? PASSWORD_RULES.MIN_CHARS : 1}
                maxLength={PASSWORD_RULES.MAX_CHARS}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {mode === 'register' && (
                <span className="block text-[11px] text-zinc-400">
                  {PASSWORD_RULES.MIN_CHARS}文字以上。よく使われるパスワードは使えません。
                </span>
              )}
            </label>
            {mode === 'register' && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">パスワード（確認）</span>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">表示名（任意）</span>
                  <input type="text" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
                </label>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                  確認メールは送信されません。ご自身のメールアドレスを入力してください。パスワードを忘れると、アカウントに戻る方法はありません。
                </p>
              </>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{mode === 'register' ? '登録する' : 'ログイン'}</span>
            </button>

            {isGuest && (
              <p className="text-center text-xs text-zinc-500">
                {mode === 'register' ? (
                  <button type="button" onClick={() => switchMode('login')} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    すでにアカウントをお持ちの方はログイン
                  </button>
                ) : (
                  <button type="button" onClick={() => switchMode('register')} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                    アカウントを登録する
                  </button>
                )}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
