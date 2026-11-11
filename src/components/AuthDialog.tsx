import React, { useState } from 'react';
import { X, Loader2, AlertCircle, ShieldCheck, LogIn, Mail } from 'lucide-react';
import { GuestDataExistsDetail, PASSWORD_RULES, SessionUser, VerificationStarted } from '../config/api';
import { ApiError } from '../services/apiClient';
import { startLogin, startRegister, verifyLogin, verifyRegister } from '../services/session';
import { GUEST_DATA_NOTICE } from '../utils/signupPrompt';

export type AuthMode = 'register' | 'login';

interface AuthDialogProps {
  initialMode: AuthMode;
  isGuest: boolean;
  onClose: () => void;
  /** 登録の直前に行う準備（セッションが無い初回画面では、昇格させるゲストを先に作る） */
  prepareRegister?: () => Promise<void>;
  /** 登録後も同じユーザー・同じデータのまま */
  onRegistered: (user: SessionUser) => void;
  /** 別のユーザーに切り替わったので、ワークスペースを読み直す */
  onLoggedIn: () => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500';

/** メールアドレス + パスワードの登録・ログイン。2 段階目としてメールに届いた確認コードを入力する。
 *  ログイン時、ゲストにデータがあれば統合するかを確認する */
export const AuthDialog: React.FC<AuthDialogProps> = ({ initialMode, isGuest, onClose, prepareRegister, onRegistered, onLoggedIn }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verification, setVerification] = useState<VerificationStarted | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [guestData, setGuestData] = useState<GuestDataExistsDetail | null>(null);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    setNotice(null);
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

  /** 1 段階目（メールアドレス + パスワード）。確認コードをメールで送る。再送も同じ */
  const sendCode = async () => {
    if (mode === 'register') {
      await prepareRegister?.();
      setVerification(await startRegister({ email, password }));
    } else {
      setVerification(await startLogin({ email, password }));
    }
    setCode('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(sendCode);
  };

  const resendCode = () => {
    void run(async () => {
      await sendCode();
      setNotice('確認コードを再送しました。以前のコードは使えません。');
    });
  };

  const completeLogin = async (choice?: 'merge' | 'discard') => {
    if (!verification) return;
    await verifyLogin({ verificationId: verification.verificationId, code, guestData: choice });
    onLoggedIn();
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verification) return;
    void run(async () => {
      if (mode === 'register') {
        onRegistered(await verifyRegister({ verificationId: verification.verificationId, code }));
      } else {
        await completeLogin();
      }
    });
  };

  const resolveGuestData = (choice: 'merge' | 'discard') => {
    if (
      choice === 'discard' &&
      !window.confirm('このブラウザのデータを削除してからログインします。削除したデータは元に戻せません。よろしいですか？')
    ) {
      return;
    }
    void run(() => completeLogin(choice));
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  const backToForm = () => {
    setVerification(null);
    setCode('');
    setError(null);
    setNotice(null);
  };

  const title = guestData
    ? 'このブラウザのデータ'
    : verification
      ? '確認コードの入力'
      : mode === 'register'
        ? 'アカウント登録'
        : 'ログイン';
  const expiresInMinutes = verification ? Math.round(verification.expiresInSeconds / 60) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            {verification && !guestData ? (
              <Mail className="w-4 h-4 text-indigo-500" />
            ) : mode === 'register' ? (
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
            ) : (
              <LogIn className="w-4 h-4 text-indigo-500" />
            )}
            <span>{title}</span>
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
        {notice && !error && (
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
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
        ) : verification ? (
          <form onSubmit={handleVerify} className="space-y-3">
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 break-all">{verification.email}</span> に
              {verification.codeLength}桁の確認コードを送りました。{expiresInMinutes}分以内に入力してください。
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">確認コード</span>
              <input
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                pattern="[0-9]*"
                maxLength={verification.codeLength}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-lg tracking-[0.5em] text-center font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
              />
            </label>
            <button
              type="submit"
              disabled={isBusy || code.length !== verification.codeLength}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{mode === 'register' ? '確認して登録する' : '確認してログイン'}</span>
            </button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={backToForm} disabled={isBusy} className="text-zinc-500 hover:underline">
                戻る
              </button>
              <button
                type="button"
                onClick={resendCode}
                disabled={isBusy}
                className="text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
              >
                コードを再送する
              </button>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              メールが届かない場合は、迷惑メールフォルダも確認してください。
            </p>
          </form>
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
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                入力したメールアドレスに確認コードを送ります。パスワードを忘れると、アカウントに戻る方法はありません。
              </p>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            >
              {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{mode === 'register' ? '確認コードを送る' : '次へ'}</span>
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
