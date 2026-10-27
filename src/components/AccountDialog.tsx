import React, { useState } from 'react';
import { X, Loader2, AlertCircle, LogOut, Trash2, Check } from 'lucide-react';
import { PASSWORD_RULES, SessionUser } from '../config/api';
import { changePassword, deleteAccount, logout, updateDisplayName } from '../services/session';
import { GUEST_DATA_NOTICE } from '../utils/signupPrompt';

interface AccountDialogProps {
  user: SessionUser;
  onClose: () => void;
  onUserUpdated: (user: SessionUser) => void;
  /** ログアウト・削除のあと。新しいゲストとして始め直す */
  onSessionEnded: () => void;
  onRegister: () => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500';
const sectionTitle = 'text-xs font-bold text-zinc-800 dark:text-zinc-200';

/** アカウント設定: 表示名・パスワードの変更、ログアウト、削除（ゲストはこのブラウザのデータの削除） */
export const AccountDialog: React.FC<AccountDialogProps> = ({ user, onClose, onUserUpdated, onSessionEnded, onRegister }) => {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<void>, doneMessage?: string) => {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      await action();
      if (doneMessage) setDone(doneMessage);
    } catch (e) {
      setError((e as Error).message || '処理に失敗しました。');
    } finally {
      setBusy(null);
    }
  };

  const handleLogout = () => {
    if (!window.confirm('ログアウトすると、このブラウザでは新しいゲストとして始まります。よろしいですか？')) return;
    void run('logout', async () => {
      await logout();
      onSessionEnded();
    });
  };

  const handleDelete = () => {
    const message = user.isGuest
      ? 'このブラウザのデータをすべて削除し、新しいゲストとして始めます。元に戻せません。よろしいですか？'
      : 'アカウントとすべてのデータを削除します。元に戻せません。よろしいですか？';
    if (!window.confirm(message)) return;
    void run('delete', async () => {
      await deleteAccount(user.isGuest ? undefined : deletePassword);
      onSessionEnded();
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            {user.isGuest ? 'ゲストとして利用中' : 'アカウント設定'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {done && (
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{done}</span>
          </div>
        )}

        {user.isGuest ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{GUEST_DATA_NOTICE}</p>
            <button
              type="button"
              onClick={onRegister}
              className="w-full px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500"
            >
              登録してデータを保護
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              <div className={sectionTitle}>メールアドレス</div>
              <div>{user.email}</div>
            </div>

            <div className="space-y-2">
              <div className={sectionTitle}>表示名</div>
              <div className="flex gap-2">
                <input type="text" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run('name', async () => onUserUpdated(await updateDisplayName(displayName)), '表示名を変更しました。')
                  }
                  className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                >
                  {busy === 'name' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '保存'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className={sectionTitle}>パスワードの変更</div>
              <input
                type="password"
                placeholder="現在のパスワード"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
              <input
                type="password"
                placeholder={`新しいパスワード（${PASSWORD_RULES.MIN_CHARS}文字以上）`}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
              <button
                type="button"
                disabled={busy !== null || !currentPassword || !newPassword}
                onClick={() =>
                  run(
                    'password',
                    async () => {
                      await changePassword(currentPassword, newPassword);
                      setCurrentPassword('');
                      setNewPassword('');
                    },
                    'パスワードを変更しました。他の端末ではログアウトされます。'
                  )
                }
                className="px-3 py-2 rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 disabled:opacity-50"
              >
                パスワードを変更
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>ログアウト</span>
            </button>
          </>
        )}

        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <div className="text-xs font-bold text-rose-600">{user.isGuest ? 'このブラウザのデータを削除' : 'アカウントを削除'}</div>
          {!user.isGuest && (
            <input
              type="password"
              placeholder="確認のためパスワードを入力"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className={inputClass}
            />
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null || (!user.isGuest && !deletePassword)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{user.isGuest ? 'データを削除して最初から' : 'アカウントとすべてのデータを削除'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
