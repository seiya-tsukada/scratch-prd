import React, { useState } from 'react';
import { AlertTriangle, Check, Loader2, FileText, RefreshCw } from 'lucide-react';
import type { Note, PrdContradiction } from '../types';
import { getNoteShortLabel } from '../utils/note';
import { PrdDiff, isEmptyDiff } from '../utils/prdLoop';

/** プレビュー上部: 矛盾があることを知らせる帯 */
export const ContradictionBanner: React.FC<{ count: number; onShow: () => void }> = ({ count, onShow }) => (
  <button
    type="button"
    onClick={onShow}
    className="w-full mb-4 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2 text-left hover:bg-rose-100 dark:hover:bg-rose-950/60"
  >
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <span className="flex-1">
      メモ同士の<strong>矛盾が {count} 件</strong>見つかりました。PRD に反映する前に確認してください。
    </span>
    <span className="underline shrink-0">確認する</span>
  </button>
);

/** AI 分類タブ: 矛盾の一覧。関係するメモへジャンプできる */
export const ContradictionList: React.FC<{
  contradictions: PrdContradiction[];
  notes: Note[];
  onOpenNote: (noteId: string) => void;
}> = ({ contradictions, notes, onOpenNote }) => (
  <div id="prd-contradictions">
    <div className="flex items-center gap-2 mb-3">
      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
        メモ同士の矛盾 (CONTRADICTION)
      </h4>
      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 font-semibold">
        {contradictions.length}件
      </span>
    </div>
    <div className="space-y-2.5">
      {contradictions.map((c) => (
        <div
          key={c.id}
          className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/60 shadow-2xs space-y-2"
        >
          <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">{c.issue}</p>
          <div className="flex flex-wrap gap-1.5">
            {(c.notesInvolved ?? []).map((noteId) => {
              const note = notes.find((n) => n.id === noteId);
              return note ? (
                <button
                  key={noteId}
                  type="button"
                  onClick={() => onOpenNote(noteId)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                  title="このメモをペインで開く"
                >
                  <FileText className="w-3 h-3" />
                  <span className="max-w-[200px] truncate">{getNoteShortLabel(note)}</span>
                </button>
              ) : (
                <span key={noteId} className="px-2 py-1 rounded-md text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                  削除されたメモ
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** 未決事項への回答欄。回答は「決定事項」セクションのメモとして保存される */
export const OpenQuestionAnswer: React.FC<{
  savedAnswer: string | null;
  onSave: (answer: string) => Promise<void>;
}> = ({ savedAnswer, onSave }) => {
  const [answer, setAnswer] = useState(savedAnswer ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = answer.trim() !== (savedAnswer ?? '').trim();

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(answer);
    } catch (e) {
      setError((e as Error).message || '保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-2 border-t border-amber-100 dark:border-amber-900/40 space-y-1.5">
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        placeholder="決めたことを書く（例: まずは iOS のみ対応する）"
        className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 outline-none resize-none focus:border-amber-500"
      />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={error ? 'text-rose-600' : 'text-emerald-600 dark:text-emerald-400'}>
          {error ?? (savedAnswer && !isDirty ? '回答済み（決定事項に保存）' : '')}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !answer.trim() || !isDirty}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-40"
        >
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          <span>{savedAnswer ? '回答を更新' : '回答を保存'}</span>
        </button>
      </div>
    </div>
  );
};

/** 未決事項の下: 回答を反映して新しい版を作る */
export const RegenerateWithAnswers: React.FC<{ answeredCount: number; onRegenerate: () => Promise<void> }> = ({
  answeredCount,
  onRegenerate,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsRunning(true);
    setError(null);
    try {
      await onRegenerate();
    } catch (e) {
      setError((e as Error).message || 'PRD の更新に失敗しました。');
      setIsRunning(false);
    }
  };

  return (
    <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-amber-800 dark:text-amber-300">
        {error ?? (answeredCount > 0 ? `${answeredCount}件の回答を PRD に反映できます。` : '未決事項に回答すると、PRD に反映できます。')}
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={answeredCount === 0 || isRunning}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40"
      >
        {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        <span>回答を反映して PRD を更新</span>
      </button>
    </div>
  );
};

const DIFF_ROWS: { key: keyof PrdDiff; label: string; tone: 'add' | 'remove' | 'resolve' }[] = [
  { key: 'factsAdded', label: '追加された要件（事実）', tone: 'add' },
  { key: 'factsRemoved', label: '削除された要件（事実）', tone: 'remove' },
  { key: 'proposalsAdded', label: '追加された提案', tone: 'add' },
  { key: 'proposalsRemoved', label: '削除された提案', tone: 'remove' },
  { key: 'questionsResolved', label: '解決した未決事項', tone: 'resolve' },
  { key: 'questionsAdded', label: '新しい未決事項', tone: 'add' },
];

const TONE_CLASSES = {
  add: 'text-emerald-700 dark:text-emerald-400',
  remove: 'text-rose-700 dark:text-rose-400',
  resolve: 'text-indigo-700 dark:text-indigo-400',
};
const TONE_MARKS = { add: '+', remove: '−', resolve: '✓' };

/** 版の履歴: ひとつ前の版からの変化 */
export const VersionDiff: React.FC<{ diff: PrdDiff; fromVersion: number }> = ({ diff, fromVersion }) => (
  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-1 text-[11px]">
    <div className="text-zinc-500">v{fromVersion} からの変化</div>
    {isEmptyDiff(diff) ? (
      <div className="text-zinc-400">要件・提案・未決事項に変化はありません。</div>
    ) : (
      DIFF_ROWS.filter((row) => diff[row.key].length > 0).map((row) => (
        <div key={row.key}>
          <div className={`font-semibold ${TONE_CLASSES[row.tone]}`}>
            {row.label}（{diff[row.key].length}）
          </div>
          <ul className="pl-3 space-y-0.5">
            {diff[row.key].map((item) => (
              <li key={item} className="text-zinc-600 dark:text-zinc-400">
                {TONE_MARKS[row.tone]} {item}
              </li>
            ))}
          </ul>
        </div>
      ))
    )}
  </div>
);
