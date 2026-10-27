import React, { useState } from 'react';
import { HardDriveDownload, Loader2, AlertCircle } from 'lucide-react';
import type { LegacyProjectSummary } from '../services/legacyImport';

interface LegacyImportDialogProps {
  projects: LegacyProjectSummary[];
  onImport: () => Promise<void>;
  onDiscard: () => void;
  onLater: () => void;
}

/** 旧バージョンが localStorage に残したデータの取り込みを確認する */
export const LegacyImportDialog: React.FC<LegacyImportDialogProps> = ({ projects, onImport, onDiscard, onLater }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteCount = projects.reduce((sum, p) => sum + p.noteCount, 0);

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    try {
      await onImport();
    } catch (e) {
      setError((e as Error).message || '取り込みに失敗しました。');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDiscard = () => {
    if (window.confirm('このブラウザに残っている以前のデータを、取り込まずに削除します。元に戻せません。よろしいですか？')) {
      onDiscard();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
            <HardDriveDownload className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">以前のデータが見つかりました</h2>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          このブラウザに、以前のバージョンで作成したデータ（{projects.length}プロジェクト・メモ{noteCount}件）が残っています。
          取り込むと、今のワークスペースに追加されます。
        </p>

        <ul className="max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
          {projects.map((p) => (
            <li key={p.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="truncate text-zinc-800 dark:text-zinc-200">{p.name}</span>
              <span className="shrink-0 text-zinc-400">メモ{p.noteCount}件</span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error} 取り込めなかった分は、次回また確認します。</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isImporting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
          >
            取り込まずに削除
          </button>
          <button
            type="button"
            onClick={onLater}
            disabled={isImporting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            あとで
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
          >
            {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>取り込む</span>
          </button>
        </div>
      </div>
    </div>
  );
};
