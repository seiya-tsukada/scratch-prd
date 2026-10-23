import React, { useState, useEffect } from 'react';
import {
  Wand2,
  X,
  Check,
  Copy,
  Plus,
  ArrowRight,
  Loader2,
  FileText,
  Sparkles,
  AlertCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { Note, Section } from '../types';
import { MarkdownRenderer } from '../utils/markdown';

interface StructureRoughNoteModalProps {
  isOpen: boolean;
  notes: Note[];
  sections: Section[];
  activeNoteId: string | null;
  projectName: string;
  onClose: () => void;
  onApplyToNote: (noteId: string, newTitle: string, newContent: string) => void;
  onSaveAsNewNote: (sectionId: string, title: string, content: string) => void;
}

export const StructureRoughNoteModal: React.FC<StructureRoughNoteModalProps> = ({
  isOpen,
  notes,
  sections,
  activeNoteId,
  projectName,
  onClose,
  onApplyToNote,
  onSaveAsNewNote,
}) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string>(activeNoteId || notes[0]?.id || '');
  const [rawContent, setRawContent] = useState('');
  const [rawTitle, setRawTitle] = useState('');
  const [structuredTitle, setStructuredTitle] = useState('');
  const [structuredContent, setStructuredContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  // When activeNoteId changes or modal opens, initialize with active note
  useEffect(() => {
    if (isOpen) {
      const targetId = activeNoteId || notes[0]?.id || '';
      setSelectedNoteId(targetId);
      const note = notes.find((n) => n.id === targetId);
      if (note) {
        setRawTitle(note.title);
        setRawContent(note.content);
      }
      setStructuredTitle('');
      setStructuredContent('');
      setError(null);
      setApplied(false);
    }
  }, [isOpen, activeNoteId, notes]);

  // Switch selected note
  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    const note = notes.find((n) => n.id === id);
    if (note) {
      setRawTitle(note.title);
      setRawContent(note.content);
      setStructuredTitle('');
      setStructuredContent('');
      setError(null);
      setApplied(false);
    }
  };

  const handleStructure = async () => {
    if (!rawContent.trim()) {
      setError('メモの本文が空です。殴り書きの内容を入力してください。');
      return;
    }

    setIsLoading(true);
    setError(null);
    setApplied(false);

    try {
      const res = await fetch('/api/structure-rough-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: rawTitle,
          content: rawContent,
          projectName,
        }),
      });

      if (!res.ok) {
        throw new Error(`サーバーエラー: ${res.statusText}`);
      }

      const data = await res.json();
      setStructuredTitle(data.structuredTitle || rawTitle || '構造化PRDメモ');
      setStructuredContent(data.structuredContent || '');
    } catch (err: any) {
      console.error(err);
      setError(err.message || '構造化中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!structuredContent) return;
    navigator.clipboard.writeText(structuredContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyToActive = () => {
    if (!selectedNoteId || !structuredContent) return;
    onApplyToNote(selectedNoteId, structuredTitle, structuredContent);
    setApplied(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handleSaveAsNew = () => {
    if (!structuredContent) return;
    const targetSec =
      sections.find((s) => s.name.includes('Features') || s.name.includes('PRD')) ||
      sections[0];
    onSaveAsNewNote(targetSec ? targetSec.id : '', structuredTitle, structuredContent);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-zinc-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>殴り書きをPRD構造化テキストに修正</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                  超高速・1メモ整形
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                断片的なメモや箇条書きを、背景・課題・要件・未決事項のPRD形式へ一瞬で整形します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Select Note */}
        <div className="px-6 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">対象メモ:</span>
            <select
              value={selectedNoteId}
              onChange={(e) => handleSelectNote(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 max-w-xs truncate outline-none"
            >
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || n.content.slice(0, 20) || '無題のメモ'}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleStructure}
            disabled={isLoading || !rawContent.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 shadow-xs cursor-pointer active:scale-95 transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AIで整形中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>PRD形式に構造化</span>
              </>
            )}
          </button>
        </div>

        {/* Content Body: Split View (Before vs After) */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden bg-zinc-50/40 dark:bg-zinc-950/20">
          {/* Left: Raw Scribbles (Editable) */}
          <div className="flex-1 flex flex-col min-h-0 p-4 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                📝 元の殴り書きメモ
              </span>
              <span className="text-[11px] text-zinc-400">{rawContent.length}文字</span>
            </div>
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="思いつきの断片や箇条書きを入力してください..."
              className="flex-1 w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs sm:text-sm font-sans text-zinc-800 dark:text-zinc-200 outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Right: Structured PRD Output */}
          <div className="flex-1 flex flex-col min-h-0 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" />
                <span>PRD構造化プレビュー</span>
              </span>
              {structuredContent && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'コピー済み' : 'コピー'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 overflow-y-auto">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-xs">思考の断片をPRD構造に変換中...</span>
                </div>
              ) : structuredContent ? (
                <MarkdownRenderer content={structuredContent} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
                  <Wand2 className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2" />
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                    右上の「PRD形式に構造化」をクリック
                  </p>
                  <p className="text-[11px] text-zinc-400 max-w-xs">
                    箇条書きや断片的なメモを自動認識し、概要・課題・主要要件・未決事項に整理します。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-zinc-500">
            {applied ? (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                メモに適用しました！
              </span>
            ) : (
              <span>※ 「新しいメモとして保存」を選べば元のメモはそのまま残せます</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              閉じる
            </button>

            {structuredContent && (
              <>
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-500" />
                  <span>新しいメモとして保存</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyToActive}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-xs cursor-pointer active:scale-95 transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>このメモに適用（上書き）</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
