import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Check,
  Download,
  Terminal,
  RotateCw,
  Trash2,
  X,
  History,
  Tag,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Edit3,
  Save,
  Layers,
} from 'lucide-react';
import { PrdDocument, Note, PrdGenerationMode } from '../types';
import { MarkdownRenderer } from '../utils/markdown';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { DATE_LOCALE, UNTITLED_NOTE_LABEL } from '../config/app';
import {
  AI_CODING_PROMPT_HEADER,
  OPEN_QUESTION_URGENCY_LABELS,
  PROPOSAL_IMPACT_LABELS,
  getPrdModeMeta,
} from '../config/prd';
import { FallbackReason } from '../config/api';
import { FallbackNotice } from './FallbackNotice';

type ViewerTab = 'preview' | 'inspector' | 'sources' | 'history';

const MODE_BADGE_ICONS: Record<PrdGenerationMode, React.ComponentType<{ className?: string }>> = {
  strict: ShieldCheck,
  suggest: CheckCircle2,
  expand: Lightbulb,
};

interface PrdViewerModalProps {
  prd: PrdDocument;
  notes: Note[];
  /** 直前の生成が内蔵ジェネレータによるものなら、その理由（生成直後のみ表示する） */
  fallbackReason?: FallbackReason;
  onClose: () => void;
  onUpdatePrd: (prdId: string, updates: Partial<PrdDocument>) => void;
  onDeletePrd: (prdId: string) => void;
  onRegenerate: (prdId: string) => void;
  onOpenNoteInPane: (noteId: string) => void;
}

export const PrdViewerModal: React.FC<PrdViewerModalProps> = ({
  prd,
  notes,
  fallbackReason,
  onClose,
  onUpdatePrd,
  onDeletePrd,
  onRegenerate,
  onOpenNoteInPane,
}) => {
  const [activeTab, setActiveTab] = useState<ViewerTab>('preview');
  const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
  const [editableContent, setEditableContent] = useState(prd.content);
  const { copied: copiedMd, copy: copyMarkdown } = useCopyFeedback();
  const { copied: copiedAiPrompt, copy: copyAiPrompt } = useCopyFeedback();

  // Source notes
  const sourceNotes = notes.filter((n) => prd.sourceNoteIds?.includes(n.id));

  // Handle saving direct markdown edits
  const handleSaveMarkdownEdit = () => {
    onUpdatePrd(prd.id, { content: editableContent });
    setIsEditingMarkdown(false);
  };

  const handleCopyMarkdown = () => copyMarkdown(editableContent);

  // AIコーディングツール (Cursor, Claude Code, Windsurf) 向けのプロンプト形式
  const handleCopyAiPrompt = () => copyAiPrompt(AI_CODING_PROMPT_HEADER + editableContent);

  // Download .md file
  const handleDownloadMd = () => {
    const blob = new Blob([editableContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prd.title.replace(/\s+/g, '_')}_v${prd.version || 1}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const modeMeta = getPrdModeMeta(prd.generationMode);

  const tabs: {
    key: ViewerTab;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { key: 'preview', label: '仕様書 (PRD)', Icon: FileText },
    {
      key: 'inspector',
      label: 'AI分類インスペクター',
      Icon: Tag,
      badge: (prd.facts?.length || 0) + (prd.proposals?.length || 0) + (prd.openQuestions?.length || 0),
    },
    { key: 'sources', label: `参照ノート一覧 (${sourceNotes.length})`, Icon: Layers },
    { key: 'history', label: `バージョン履歴 (${prd.versions?.length || 0})`, Icon: History },
  ];
  const ModeIcon = MODE_BADGE_ICONS[prd.generationMode] ?? MODE_BADGE_ICONS.suggest;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-900/60 backdrop-blur-xs">
      <div
        className="w-full max-w-5xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {prd.title}
                </h2>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
                  v{prd.version || 1}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold ${modeMeta.badgeClass}`}>
                  <ModeIcon className="w-3 h-3" />
                  {modeMeta.badgeLabel}
                </span>
                <span>•</span>
                <span>{new Date(prd.updatedAt).toLocaleString(DATE_LOCALE)}</span>
                <span>•</span>
                <span>参照ノート: {prd.sourceNoteIds?.length || 0}件</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 transition-colors shadow-2xs"
              title="Markdown形式でコピー"
            >
              {copiedMd ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedMd ? 'コピー完了' : 'MDコピー'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyAiPrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shadow-2xs"
              title="Cursor / Claude Code 用プロンプト形式でコピー"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{copiedAiPrompt ? 'コピー完了！' : 'AIコーディング用コピー'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadMd}
              className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors"
              title="Markdownファイルをダウンロード"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onRegenerate(prd.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              title="このPRDを再生成・更新"
            >
              <RotateCw className="w-3.5 h-3.5 text-indigo-500" />
              <span>更新 / 再生成</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm('このPRDを削除してもよろしいですか？（元の思考メモは保持されます）')) {
                  onDeletePrd(prd.id);
                  onClose();
                }
              }}
              className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              title="PRDを削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {fallbackReason && <FallbackNotice reason={fallbackReason} />}

        {/* Tab Navigation */}
        <div className="px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1">
            {tabs.map(({ key, label, Icon, badge }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeTab === key
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                {badge !== undefined && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Quick Edit Mode Toggle for Preview Tab */}
          {activeTab === 'preview' && (
            <div className="flex items-center gap-2">
              {isEditingMarkdown ? (
                <button
                  type="button"
                  onClick={handleSaveMarkdownEdit}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-xs transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>編集を保存</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingMarkdown(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>仕様書を直接編集</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/30 dark:bg-zinc-950/20">
          {/* TAB 1: PREVIEW / EDIT */}
          {activeTab === 'preview' && (
            <div className="max-w-4xl mx-auto">
              {isEditingMarkdown ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs text-zinc-500 flex items-center justify-between">
                    <span>Markdown記法で仕様書を自由に加筆・修正できます。</span>
                    <button
                      type="button"
                      onClick={() => setIsEditingMarkdown(false)}
                      className="text-zinc-400 hover:text-zinc-600 text-xs"
                    >
                      キャンセル
                    </button>
                  </div>
                  <textarea
                    value={editableContent}
                    onChange={(e) => setEditableContent(e.target.value)}
                    rows={26}
                    className="w-full p-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 outline-none leading-relaxed focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-xs">
                  <MarkdownRenderer content={editableContent} />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI CLASSIFICATION INSPECTOR */}
          {activeTab === 'inspector' && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Introduction card */}
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    AI出力の意味分類インスペクター
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    「AIの推測を事実として扱わない」原則に基づき、生成結果を【FACT（原文の事実）】、【PROPOSAL（AIの提案）】、【OPEN QUESTION（未解決の論点）】に分類しています。
                  </p>
                </div>
              </div>

              {/* FACT Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    確認された事実 (FACT: 原文メモに基づく確定事項)
                  </h4>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                    {prd.facts?.length || 0}件
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {prd.facts?.map((fact) => (
                    <div
                      key={fact.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 shadow-2xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        <span>🏷️ FACT</span>
                        {fact.sourceNoteTitle && (
                          <span className="text-zinc-400 font-normal truncate max-w-[150px]">
                            出典: {fact.sourceNoteTitle}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
                        {fact.text}
                      </p>
                    </div>
                  ))}

                  {(!prd.facts || prd.facts.length === 0) && (
                    <div className="text-xs text-zinc-400 italic p-3">事実データはありません</div>
                  )}
                </div>
              </div>

              {/* PROPOSAL Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    AIによる提案・補足要件 (PROPOSAL)
                  </h4>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-semibold">
                    {prd.proposals?.length || 0}件
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {prd.proposals?.map((prop) => (
                    <div
                      key={prop.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/60 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300">
                          {prop.category || '機能提案'}
                        </span>
                        {prop.impact && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                              prop.impact === 'high'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}
                          >
                            重要度: {PROPOSAL_IMPACT_LABELS[prop.impact] ?? PROPOSAL_IMPACT_LABELS.low}
                          </span>
                        )}
                      </div>
                      <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {prop.title}
                      </h5>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {prop.description}
                      </p>
                    </div>
                  ))}

                  {(!prd.proposals || prd.proposals.length === 0) && (
                    <div className="text-xs text-zinc-400 italic p-3">
                      厳密モードのため、AIによる提案はありません。
                    </div>
                  )}
                </div>
              </div>

              {/* OPEN QUESTIONS Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    未解決の論点・要確認事項 (OPEN QUESTION)
                  </h4>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                    {prd.openQuestions?.length || 0}件
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {prd.openQuestions?.map((oq) => (
                    <div
                      key={oq.id}
                      className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-900/60 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold text-[11px]">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>要意思決定</span>
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            oq.urgency === 'critical'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          {oq.urgency === 'critical'
                            ? OPEN_QUESTION_URGENCY_LABELS.critical
                            : OPEN_QUESTION_URGENCY_LABELS.normal}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {oq.question}
                      </h5>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {oq.context}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOURCE NOTES */}
          {activeTab === 'sources' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="text-xs text-zinc-500 mb-2">
                この仕様書の生成元となった思考メモです。いつでもペインに呼び出して修正できます。
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sourceNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {note.title || UNTITLED_NOTE_LABEL}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {new Date(note.updatedAt).toLocaleDateString(DATE_LOCALE)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-4 leading-relaxed font-sans whitespace-pre-wrap">
                        {note.content}
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenNoteInPane(note.id);
                          onClose();
                        }}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <span>ペインで開いて編集</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}

                {sourceNotes.length === 0 && (
                  <div className="text-xs text-zinc-400 italic p-4">参照元のメモが見つかりません</div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: VERSION HISTORY */}
          {activeTab === 'history' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="text-xs text-zinc-500 mb-2">
                PRDの再生成や更新履歴です。過去のバージョンを閲覧・復元できます。
              </div>

              {/* Current Version */}
              <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 shadow-2xs">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full font-bold bg-indigo-600 text-white text-[10px]">
                      現在アクティブ (v{prd.version || 1})
                    </span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{prd.title}</span>
                  </div>
                  <span className="text-zinc-400 text-[11px]">{new Date(prd.updatedAt).toLocaleString(DATE_LOCALE)}</span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  現在の最新版仕様書です。
                </p>
              </div>

              {/* Past Versions */}
              {prd.versions && prd.versions.length > 0 ? (
                prd.versions.map((ver, idx) => (
                  <div
                    key={ver.id || idx}
                    className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px]">
                          v{ver.versionNumber}
                        </span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{ver.title}</span>
                        <span className="text-[10px] text-zinc-400">({ver.generationMode}モード)</span>
                      </div>
                      <span className="text-zinc-400 text-[11px]">{new Date(ver.createdAt).toLocaleString(DATE_LOCALE)}</span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <span className="text-[11px] text-zinc-500">
                        {ver.summary || `Version ${ver.versionNumber}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`バージョン v${ver.versionNumber} の内容を現在の仕様書に復元しますか？`)) {
                            onUpdatePrd(prd.id, {
                              content: ver.content,
                              facts: ver.facts,
                              proposals: ver.proposals,
                              openQuestions: ver.openQuestions,
                              contradictions: ver.contradictions,
                            });
                            setEditableContent(ver.content);
                            setActiveTab('preview');
                          }
                        }}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        このバージョンを復元
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-zinc-400 italic p-4 text-center">
                  過去のバージョン履歴はまだありません。「更新 / 再生成」を行うと履歴が自動的に記録されます。
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
