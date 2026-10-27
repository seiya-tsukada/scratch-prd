import React, { useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, Sparkles, Wand2, ArrowRight, ArrowLeft, ClipboardPaste } from 'lucide-react';
import { AI_INPUT_LIMITS, FallbackReason } from '../config/api';
import { TIMING } from '../config/app';
import { structureRoughNote } from '../services/apiClient';
import { MarkdownRenderer } from '../utils/markdown';
import { getFirstLineText } from '../utils/note';
import { generationStage } from '../utils/generationStage';
import { ONBOARDING_EXAMPLE } from '../utils/onboarding';
import { FallbackNotice } from './FallbackNotice';

/** onboarding: 初回の案内（殴り書き → 整形 → PRD の 3 ステップ）／ quick: 貼るだけ PRD */
export type QuickPrdMode = 'onboarding' | 'quick';

interface QuickPrdDialogProps {
  mode: QuickPrdMode;
  projectName: string;
  /** メモを作って PRD を生成し、ビューアを開く。structured は整形してから生成したか */
  onGenerate: (title: string, content: string, structured: boolean) => Promise<void>;
  /** 閉じる（onboarding では「スキップ」として扱う） */
  onClose: () => void;
}

type Step = 'write' | 'structured' | 'generating';

const STEPS: { key: Exclude<Step, 'generating'> | 'prd'; label: string }[] = [
  { key: 'write', label: '殴り書きする' },
  { key: 'structured', label: '整形する' },
  { key: 'prd', label: 'PRD にする' },
];

const clipTitle = (title: string) => title.trim().slice(0, AI_INPUT_LIMITS.MAX_TITLE_CHARS);

/** メモを貼るだけで PRD を作る。初回の案内では、同じ流れを 3 ステップで案内する */
export const QuickPrdDialog: React.FC<QuickPrdDialogProps> = ({ mode, projectName, onGenerate, onClose }) => {
  const isOnboarding = mode === 'onboarding';
  const [step, setStep] = useState<Step>('write');
  const [rawContent, setRawContent] = useState('');
  const [structured, setStructured] = useState<{ title: string; content: string; fallback?: FallbackReason } | null>(
    null
  );
  const [isStructuring, setIsStructuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const isOverLimit = rawContent.length > AI_INPUT_LIMITS.MAX_ROUGH_NOTE_CHARS;
  const isEmpty = !rawContent.trim();

  useEffect(() => {
    if (step !== 'generating') return;
    setElapsed(0);
    const tick = TIMING.GENERATION_TIMER_INTERVAL_MS / 1000;
    const timer = setInterval(() => setElapsed((prev) => +(prev + tick).toFixed(1)), TIMING.GENERATION_TIMER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [step]);

  const handleStructure = async () => {
    setIsStructuring(true);
    setError(null);
    try {
      const data = await structureRoughNote({
        title: clipTitle(getFirstLineText(rawContent)),
        content: rawContent,
        projectName: clipTitle(projectName),
      });
      setStructured({
        title: data.structuredTitle,
        content: data.structuredContent,
        fallback: data.usedFallback ? data.fallbackReason ?? 'ai_error' : undefined,
      });
      setStep('structured');
    } catch (e) {
      setError((e as Error).message || '整形に失敗しました。');
    } finally {
      setIsStructuring(false);
    }
  };

  const handleGenerate = async () => {
    const useStructured = step === 'structured' && structured !== null;
    const title = useStructured ? structured.title : getFirstLineText(rawContent);
    const content = useStructured ? structured.content : rawContent;
    setError(null);
    setStep('generating');
    try {
      await onGenerate(clipTitle(title), content, useStructured);
    } catch (e) {
      setError((e as Error).message || 'PRD の生成に失敗しました。');
      setStep(useStructured ? 'structured' : 'write');
    }
  };

  const activeIndex = step === 'write' ? 0 : step === 'structured' ? 1 : 2;
  const busy = isStructuring || step === 'generating';

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-3 sm:p-5 bg-zinc-900/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>{isOnboarding ? 'ようこそ！ 3 ステップで最初の PRD を作りましょう' : '貼るだけ PRD'}</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isOnboarding
                ? '思いつきを書くだけで、AI が開発に使える要件定義書（PRD）にまとめます。'
                : '雑多なメモを貼り付けるだけで PRD を作ります。メモは Inbox に保存されます。'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-1 text-zinc-400 hover:text-zinc-700" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isOnboarding && (
          <ol className="px-6 pt-3 flex items-center gap-2 text-[11px]">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center font-bold ${
                    i <= activeIndex
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={i === activeIndex ? 'font-semibold text-zinc-800 dark:text-zinc-200' : 'text-zinc-400'}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-zinc-300 dark:text-zinc-700">—</span>}
              </li>
            ))}
          </ol>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'write' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {isOnboarding ? '作りたいもの・困っていること・思いついたことを、そのまま書いてください' : 'メモを貼り付け'}
                </span>
                <button
                  type="button"
                  onClick={() => setRawContent(ONBOARDING_EXAMPLE)}
                  className="flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>例文を使う</span>
                </button>
              </div>
              <textarea
                autoFocus
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                placeholder={'例）\n家計簿アプリ\n- レシートを撮るだけで記録したい\n- 月ごとの集計'}
                className="w-full h-56 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-800 dark:text-zinc-200 outline-none resize-none leading-relaxed focus:border-indigo-500"
              />
              <div className={`text-right text-[11px] ${isOverLimit ? 'text-rose-600 font-semibold' : 'text-zinc-400'}`}>
                {rawContent.length.toLocaleString()} / {AI_INPUT_LIMITS.MAX_ROUGH_NOTE_CHARS.toLocaleString()}文字
              </div>
            </>
          )}

          {step === 'structured' && structured && (
            <>
              {structured.fallback && <FallbackNotice reason={structured.fallback} className="rounded-lg border" />}
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                殴り書きを、概要・課題・要件・未決事項に整理しました。この内容から PRD を作ります。
              </p>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 max-h-72 overflow-y-auto">
                <MarkdownRenderer content={structured.content} />
              </div>
            </>
          )}

          {step === 'generating' && (
            <div className="h-56 flex flex-col items-center justify-center gap-3 text-sm text-indigo-600 dark:text-indigo-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>{generationStage(elapsed)}</span>
              <span className="text-[11px] text-zinc-400">{elapsed} 秒</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'generating' && (
          <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              {step === 'structured' ? (
                <button
                  type="button"
                  onClick={() => setStep('write')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>書き直す</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {isOnboarding ? 'スキップ' : '閉じる'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step === 'write' && (
                <button
                  type="button"
                  onClick={handleStructure}
                  disabled={isEmpty || isOverLimit || isStructuring}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                    isOnboarding
                      ? 'text-white bg-indigo-600 hover:bg-indigo-500'
                      : 'text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/70 hover:bg-amber-200'
                  }`}
                >
                  {isStructuring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  <span>{isOnboarding ? '整形する' : '先に整形する'}</span>
                  {isOnboarding && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              )}
              {(step === 'structured' || !isOnboarding) && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={(step === 'write' && (isEmpty || isOverLimit)) || isStructuring}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>PRD にする</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
