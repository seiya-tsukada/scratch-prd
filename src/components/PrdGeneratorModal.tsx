import React, { useEffect, useState } from 'react';
import { Sparkles, X, AlertCircle, Loader2, Layers, ShieldCheck, Lightbulb, Rocket, ChevronDown } from 'lucide-react';
import {
  Note,
  Section,
  PrdDocument,
  PrdGenerationMode,
  PrdDetailLevel,
} from '../types';
import { TIMING } from '../config/app';
import {
  DEFAULT_DETAIL_LEVEL,
  DEFAULT_GENERATION_MODE,
  NEW_PRD_TARGET,
  PRD_DETAIL_LEVEL_LABELS,
  PRD_DETAIL_LEVEL_ORDER,
  PRD_MODE_META,
  PRD_MODE_ORDER,
} from '../config/prd';
import { getNoteDisplayTitle } from '../utils/note';
import { getPrdInputLimitError } from '../utils/aiLimits';
import { generationStage } from '../utils/generationStage';

const MODE_ICONS: Record<PrdGenerationMode, React.ComponentType<{ className?: string }>> = {
  strict: ShieldCheck,
  suggest: Lightbulb,
  expand: Rocket,
};

export interface PrdGenerateParams {
  selectedNoteIds: string[];
  mode: PrdGenerationMode;
  detailLevel: PrdDetailLevel;
  targetPrdId?: string;
}

const StepBadge: React.FC<{ step: number }> = ({ step }) => (
  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
    {step}
  </span>
);

interface PrdGeneratorModalProps {
  isOpen: boolean;
  notes: Note[];
  sections: Section[];
  existingPrds: PrdDocument[];
  projectName: string;
  defaultTargetPrdId?: string | null;
  onClose: () => void;
  onGenerate: (params: PrdGenerateParams) => Promise<void>;
}

export const PrdGeneratorModal: React.FC<PrdGeneratorModalProps> = ({
  isOpen,
  notes,
  sections,
  existingPrds,
  projectName,
  defaultTargetPrdId,
  onClose,
  onGenerate,
}) => {
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [mode, setMode] = useState<PrdGenerationMode>(DEFAULT_GENERATION_MODE);
  const [detailLevel, setDetailLevel] = useState<PrdDetailLevel>(DEFAULT_DETAIL_LEVEL);
  const [targetPrdId, setTargetPrdId] = useState<string>(NEW_PRD_TARGET);
  const [isGenerating, setIsGenerating] = useState(false);
  // モード・詳細度・保存先は推奨値を選んだ状態で折りたたむ
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // モーダルは常にマウントされているため、開くたびにフォームを初期化する。
  // 既存PRDの再生成なら、そのPRDの参照メモ・モード・詳細度を引き継ぐ。
  useEffect(() => {
    if (!isOpen) return;
    const targetPrd = existingPrds.find((p) => p.id === defaultTargetPrdId);
    const noteIds = notes.map((n) => n.id);
    const sourceNoteIds = targetPrd ? noteIds.filter((id) => targetPrd.sourceNoteIds?.includes(id)) : [];

    setSelectedNoteIds(sourceNoteIds.length > 0 ? sourceNoteIds : noteIds);
    setTargetPrdId(targetPrd ? targetPrd.id : NEW_PRD_TARGET);
    setMode(targetPrd?.generationMode || DEFAULT_GENERATION_MODE);
    setDetailLevel(targetPrd?.detailLevel || DEFAULT_DETAIL_LEVEL);
    setShowAdvanced(false);
    setError(null);
  }, [isOpen]);

  // フックは early return より前に宣言する必要がある
  if (!isOpen) return null;

  const toggleNote = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedNoteIds(notes.map((n) => n.id));
  const deselectAll = () => setSelectedNoteIds([]);

  const selectedNotes = notes.filter((n) => selectedNoteIds.includes(n.id));
  const selectedNotesCount = selectedNotes.length;
  const totalCharacters = selectedNotes.reduce((sum, n) => sum + n.content.length, 0);
  const limitError = getPrdInputLimitError(selectedNotes);

  const handleStartGeneration = async () => {
    if (selectedNoteIds.length === 0) {
      setError('PRDを生成するには少なくとも1つのメモを選択してください。');
      return;
    }
    if (limitError) {
      setError(limitError);
      return;
    }

    setError(null);
    setIsGenerating(true);
    setElapsedTime(0);

    const tickSeconds = TIMING.GENERATION_TIMER_INTERVAL_MS / 1000;
    const timer = setInterval(() => {
      setElapsedTime((prev) => +(prev + tickSeconds).toFixed(1));
    }, TIMING.GENERATION_TIMER_INTERVAL_MS);

    try {
      await onGenerate({
        selectedNoteIds,
        mode,
        detailLevel,
        targetPrdId: targetPrdId === NEW_PRD_TARGET ? undefined : targetPrdId,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'PRD生成中にエラーが発生しました。もう一度お試しください。');
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                AIによるPRD（要件定義書）生成
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                選択したメモの断片から、実装可能な構造化PRDを自動構築します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Target Notes Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <StepBadge step={1} />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  入力メモの選択 ({selectedNotesCount}/{notes.length}件選択中 • 約{totalCharacters}文字)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px] font-medium"
                >
                  全選択
                </button>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-[11px]"
                >
                  解除
                </button>
              </div>
            </div>

            {limitError && (
              <div className="mb-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{limitError} 選択するメモを減らしてください。</span>
              </div>
            )}

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 max-h-44 overflow-y-auto space-y-3 bg-zinc-50/40 dark:bg-zinc-950/20">
              {sections.map((sec) => {
                const secNotes = notes.filter((n) => n.sectionId === sec.id);
                if (secNotes.length === 0) return null;

                return (
                  <div key={sec.id} className="space-y-1">
                    <div className="text-[11px] font-semibold text-zinc-400 px-1 flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      <span>{sec.name}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-2">
                      {secNotes.map((note) => {
                        const isSelected = selectedNoteIds.includes(note.id);
                        const title = getNoteDisplayTitle(note.title, note.content);

                        return (
                          <div
                            key={note.id}
                            onClick={() => toggleNote(note.id)}
                            className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition-colors ${
                              isSelected
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 font-medium'
                                : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/60 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by parent onClick
                              className="rounded border-zinc-300 text-indigo-600 pointer-events-none"
                            />
                            <span className="truncate">{title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {notes.length === 0 && (
                <div className="text-center py-4 text-xs text-zinc-400">
                  メモがありません。まずはワークスペースでメモを作成してください。
                </div>
              )}
            </div>
          </div>

          {/* 詳細設定（モード・詳細度・保存先）。閉じている間は選択中の内容を 1 行で示す */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">詳細設定</span>
              <span className="ml-2">
                {PRD_MODE_META[mode].cardTitle}・{PRD_DETAIL_LEVEL_LABELS[detailLevel]}・
                {targetPrdId === NEW_PRD_TARGET
                  ? '新しいPRD'
                  : `「${existingPrds.find((p) => p.id === targetPrdId)?.title ?? ''}」を更新`}
              </span>
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>

          {showAdvanced && (
          <>
          {/* 2. Generation Mode Selection */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StepBadge step={2} />
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                AI生成モードを選択
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PRD_MODE_ORDER.map((modeKey) => {
                const meta = PRD_MODE_META[modeKey];
                const ModeIcon = MODE_ICONS[modeKey];
                return (
                  <div
                    key={modeKey}
                    onClick={() => setMode(modeKey)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all${meta.recommended ? ' relative' : ''} ${
                      mode === modeKey
                        ? meta.cardSelectedClass
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/50'
                    }`}
                  >
                    {meta.recommended && (
                      <div className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                        おすすめ
                      </div>
                    )}
                    <div className={`flex items-center gap-1.5 ${meta.cardAccentClass} mb-1`}>
                      <ModeIcon className="w-4 h-4" />
                      <span className="text-xs font-bold">{meta.cardTitle}</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-normal">
                      {meta.cardDescription}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Detail Level & Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Detail Level */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StepBadge step={3} />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  PRDの詳細度
                </span>
              </div>
              <div className="flex items-center gap-2">
                {PRD_DETAIL_LEVEL_ORDER.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setDetailLevel(lvl)}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg border text-center transition-colors ${
                      detailLevel === lvl
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 font-semibold'
                        : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {PRD_DETAIL_LEVEL_LABELS[lvl]}
                  </button>
                ))}
              </div>
            </div>

            {/* Target PRD (New or Update Existing) */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StepBadge step={4} />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  保存先
                </span>
              </div>
              <select
                value={targetPrdId}
                onChange={(e) => setTargetPrdId(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 outline-none"
              >
                <option value={NEW_PRD_TARGET}>+ 新しいPRDドキュメントとして作成</option>
                {existingPrds.map((p) => (
                  <option key={p.id} value={p.id}>
                    「{p.title}」の新バージョン (v{(p.version || 1) + 1}) として更新
                  </option>
                ))}
              </select>
            </div>
          </div>
          </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {isGenerating ? (
              <span className="flex items-center gap-2 font-medium text-indigo-600 dark:text-indigo-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{generationStage(elapsedTime)} ({elapsedTime}秒)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-zinc-500">
                <span className="text-emerald-500 font-semibold">⚡ 高速生成最適化</span>
                <span>• 元メモは非破壊で安全に保存</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleStartGeneration}
              disabled={isGenerating || selectedNotesCount === 0 || limitError !== null}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>生成中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>PRDを生成する</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
