import React from 'react';
import { Database, X, Copy, Check, Shield, Code2 } from 'lucide-react';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { SUPABASE_SCHEMA_SQL } from '../config/supabaseSchema';

interface SupabaseGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseGuideModal: React.FC<SupabaseGuideModalProps> = ({ isOpen, onClose }) => {
  const { copied, copy } = useCopyFeedback();

  if (!isOpen) return null;


  const handleCopy = () => copy(SUPABASE_SCHEMA_SQL);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Supabase PostgreSQL & Auth 設計仕様
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                PRD要件定義書（Section 7 & 8）に準拠したデータ構造とRLSセキュリティ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
              <Shield className="w-4 h-4" />
              <span>Phase 1 プロトタイプと Phase 2 Supabase 接続の分離設計</span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              本アプリケーションはリポジトリパターン（<code>IWorkspaceRepository</code>）を採用しているため、フロントエンドUIやAI生成ロジックを変更することなく、Supabase クライアントと即座に切り替え可能です。
            </p>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-zinc-400" />
              <span>Supabase SQL マイグレーションスクリプト</span>
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 transition-colors shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'コピーしました！' : 'SQLをコピー'}</span>
            </button>
          </div>

          <div className="rounded-xl bg-zinc-950 p-4 border border-zinc-800 text-xs font-mono text-zinc-200 overflow-x-auto max-h-72">
            <pre className="whitespace-pre">{SUPABASE_SCHEMA_SQL}</pre>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
