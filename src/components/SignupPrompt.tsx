import React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { SIGNUP_PROMPT_MESSAGES, GUEST_DATA_NOTICE, SignupPromptTrigger } from '../utils/signupPrompt';

interface SignupPromptProps {
  trigger: SignupPromptTrigger;
  onRegister: () => void;
  onDismiss: () => void;
}

/** ゲストへの登録の案内（押し付けない: 閉じたら一定期間は出さない） */
export const SignupPrompt: React.FC<SignupPromptProps> = ({ trigger, onRegister, onDismiss }) => (
  <div
    role="status"
    className="fixed bottom-4 right-4 z-[55] w-[calc(100%-2rem)] max-w-xs rounded-xl bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-900 shadow-xl p-4 space-y-2"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
        <ShieldCheck className="w-4 h-4 text-indigo-500" />
        <span>{SIGNUP_PROMPT_MESSAGES[trigger]}</span>
      </div>
      <button type="button" onClick={onDismiss} className="text-zinc-400 hover:text-zinc-700" aria-label="閉じる">
        <X className="w-4 h-4" />
      </button>
    </div>
    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
      {GUEST_DATA_NOTICE}アカウントを登録すると、今のデータをそのまま引き継いで、別のブラウザからも使えます。
    </p>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onDismiss} className="px-2.5 py-1 rounded-lg text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        あとで
      </button>
      <button
        type="button"
        onClick={onRegister}
        className="px-3 py-1 rounded-lg text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500"
      >
        登録してデータを保護
      </button>
    </div>
  </div>
);
