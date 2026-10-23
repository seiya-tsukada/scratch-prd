import React, { useState } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sliders,
  CheckSquare,
  Square,
  Loader2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Lightbulb,
  Rocket,
} from 'lucide-react';
import {
  Note,
  Section,
  PrdDocument,
  PrdGenerationMode,
  PrdDetailLevel,
} from '../types';

interface PrdGeneratorModalProps {
  isOpen: boolean;
  notes: Note[];
  sections: Section[];
  existingPrds: PrdDocument[];
  projectName: string;
  defaultTargetPrdId?: string | null;
  onClose: () => void;
  onGenerate: (params: {
    selectedNoteIds: string[];
    mode: PrdGenerationMode;
    detailLevel: PrdDetailLevel;
    targetPrdId?: string;
  }) => Promise<void>;
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
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>(
    notes.map((n) => n.id) // Default all selected
  );
  const [mode, setMode] = useState<PrdGenerationMode>('suggest');
  const [detailLevel, setDetailLevel] = useState<PrdDetailLevel>('standard');
  const [targetPrdId, setTargetPrdId] = useState<string>(
    defaultTargetPrdId || 'new'
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleNote = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedNoteIds(notes.map((n) => n.id));
  const deselectAll = () => setSelectedNoteIds([]);

  const [elapsedTime, setElapsedTime] = useState(0);

  const handleStartGeneration = async () => {
    if (selectedNoteIds.length === 0) {
      setError('PRDを生成するには少なくとも1つのメモを選択してください。');
      return;
    }

    setError(null);
    setIsGenerating(true);
    setElapsedTime(0);
    setGenerationStep('AI仕様書を高速生成中...');

    const timer = setInterval(() => {
      setElapsedTime((prev) => +(prev + 0.1).toFixed(1));
    }, 100);

    try {
      await onGenerate({
        selectedNoteIds,
        mode,
        detailLevel,
        targetPrdId: targetPrdId === 'new' ? undefined : targetPrdId,
      });

      clearInterval(timer);
      onClose();
    } catch (err: any) {
      clearInterval(timer);
      console.error(err);
      setError(err.message || 'PRD生成中にエラーが発生しました。もう一度お試しください。');
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
    }
  };

  const selectedNotesCount = selectedNoteIds.length;
  const totalCharacters = notes
    .filter((n) => selectedNoteIds.includes(n.id))
    .reduce((sum, n) => sum + n.content.length, 0);

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
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
                  1
                </span>
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
                        const title =
                          note.title.trim() ||
                          note.content.split('\n')[0].replace(/^#+\s*/, '') ||
                          '無題のメモ';

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

          {/* 2. Generation Mode Selection */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                AI生成モードを選択
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Mode A: Strict */}
              <div
                onClick={() => setMode('strict')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  mode === 'strict'
                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-xs font-bold">厳密 (Strict)</span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-normal">
                  メモに書かれた事実のみを使用。AIによる勝手な創作や推測を行わず、不足箇所は「未定」「要確認」と明記します。
                </p>
              </div>

              {/* Mode B: Organize & Suggest (Default) */}
              <div
                onClick={() => setMode('suggest')}
                className={`p-3 rounded-xl border cursor-pointer transition-all relative ${
                  mode === 'suggest'
                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/50'
                }`}
              >
                <div className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                  おすすめ
                </div>
                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 mb-1">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-xs font-bold">整理＆提案 (Suggest)</span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-normal">
                  原文の意図を汲んで構造化し、不足部分を明確な「AI提案ラベル」付きで補足します。MVPの推奨設定です。
                </p>
              </div>

              {/* Mode C: Expand */}
              <div
                onClick={() => setMode('expand')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  mode === 'expand'
                    ? 'border-purple-500 bg-purple-50/40 dark:bg-purple-950/20 ring-1 ring-purple-500'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 mb-1">
                  <Rocket className="w-4 h-4" />
                  <span className="text-xs font-bold">仮説拡張 (Expand)</span>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-normal">
                  機能案、ユーザー仮説、KPI候補、リスク、検証方法まで仮説として積極的に提案し、企画を広げます。
                </p>
              </div>
            </div>
          </div>

          {/* 3. Detail Level & Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Detail Level */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  PRDの詳細度
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(['brief', 'standard', 'detailed'] as PrdDetailLevel[]).map((lvl) => (
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
                    {lvl === 'brief' ? '簡易' : lvl === 'standard' ? '標準' : '詳細'}
                  </button>
                ))}
              </div>
            </div>

            {/* Target PRD (New or Update Existing) */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
                  4
                </span>
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  保存先
                </span>
              </div>
              <select
                value={targetPrdId}
                onChange={(e) => setTargetPrdId(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 outline-none"
              >
                <option value="new">+ 新しいPRDドキュメントとして作成</option>
                {existingPrds.map((p) => (
                  <option key={p.id} value={p.id}>
                    「{p.title}」の新バージョン (v{(p.version || 1) + 1}) として更新
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {isGenerating ? (
              <span className="flex items-center gap-2 font-medium text-indigo-600 dark:text-indigo-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{generationStep} ({elapsedTime}秒)</span>
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
              disabled={isGenerating || selectedNotesCount === 0}
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
