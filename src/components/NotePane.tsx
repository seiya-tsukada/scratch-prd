import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  Eye,
  Edit3,
  Columns,
  Plus,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  CheckSquare,
  Quote,
  Code,
  FolderInput,
  Folder,
  Wand2,
} from 'lucide-react';
import { Note, Section } from '../types';
import { MarkdownRenderer } from '../utils/markdown';
import { getFirstLineText, getNoteShortLabel } from '../utils/note';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { DATE_LOCALE, TIMING, UNTITLED_NOTE_LABEL } from '../config/app';

type ViewMode = 'edit' | 'preview' | 'split';

const VIEW_MODE_OPTIONS: {
  mode: ViewMode;
  title: string;
  hideOnMobile: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { mode: 'edit', title: 'エディタ', hideOnMobile: false, Icon: Edit3 },
  { mode: 'split', title: '編集とプレビューを分割', hideOnMobile: true, Icon: Columns },
  { mode: 'preview', title: 'プレビュー', hideOnMobile: false, Icon: Eye },
];

/** 書式ツールバー。'divider' は区切り線 */
const FORMATTING_ACTIONS: (
  | 'divider'
  | {
      prefix: string;
      suffix?: string;
      title: string;
      Icon: React.ComponentType<{ className?: string }>;
    }
)[] = [
  { prefix: '**', suffix: '**', title: '太字 (Bold)', Icon: Bold },
  { prefix: '*', suffix: '*', title: '斜体 (Italic)', Icon: Italic },
  'divider',
  { prefix: '# ', title: '見出し 1', Icon: Heading1 },
  { prefix: '## ', title: '見出し 2', Icon: Heading2 },
  'divider',
  { prefix: '- ', title: '箇条書きリスト', Icon: List },
  { prefix: '- [ ] ', title: 'タスクチェックボックス', Icon: CheckSquare },
  { prefix: '> ', title: '引用 (Quote)', Icon: Quote },
  { prefix: '`', suffix: '`', title: 'インラインコード', Icon: Code },
];

/** 選択範囲が空のときに書式で囲むプレースホルダー */
const FORMATTING_PLACEHOLDER = 'テキスト';

interface NotePaneProps {
  paneIndex: number;
  note: Note | null;
  allNotes: Note[];
  sections: Section[];
  isActive: boolean;
  onActivate: () => void;
  onSelectNote: (noteId: string) => void;
  onCreateNoteInPane: () => void;
  onUpdateNote: (noteId: string, updates: Partial<Note>) => void;
  onDeleteNote: (noteId: string) => void;
  onMoveNote: (noteId: string, targetSectionId: string) => void;
  onStructureNote?: (noteId: string) => void;
  /** 変わると入力中の内容をサーバーの値で読み直す（競合時など） */
  syncKey?: number;
}

export const NotePane: React.FC<NotePaneProps> = ({
  paneIndex,
  note,
  allNotes,
  sections,
  isActive,
  onActivate,
  onSelectNote,
  onCreateNoteInPane,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  onStructureNote,
  syncKey = 0,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const { copied, copy } = useCopyFeedback();
  const [isNoteDropdownOpen, setIsNoteDropdownOpen] = useState(false);
  const [isSectionDropdownOpen, setIsSectionDropdownOpen] = useState(false);

  // Local state for instant typing with debounced save to repository
  const [localTitle, setLocalTitle] = useState(note?.title || '');
  const [localContent, setLocalContent] = useState(note?.content || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // デバウンス中の変更（タイトルと本文をまとめて保存する）
  const pendingRef = useRef<{ noteId: string; updates: Partial<Note> } | null>(null);
  const onUpdateNoteRef = useRef(onUpdateNote);
  onUpdateNoteRef.current = onUpdateNote;

  const flushPending = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) onUpdateNoteRef.current(pending.noteId, pending.updates);
  };

  // 別のメモに切り替える前・閉じる前に、デバウンス中の変更を保存する
  useEffect(() => flushPending, [note?.id]);

  // メモが切り替わったとき、またはサーバーの値で読み直すとき（syncKey）に入力欄を更新する
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    pendingRef.current = null;
    setLocalTitle(note?.title || '');
    setLocalContent(note?.content || '');
  }, [note?.id, syncKey]);

  // タイトル・本文の変更はデバウンスして保存する
  const scheduleSave = (updates: Partial<Note>) => {
    if (!note) return;
    const previous = pendingRef.current?.noteId === note.id ? pendingRef.current.updates : {};
    pendingRef.current = { noteId: note.id, updates: { ...previous, ...updates } };
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(flushPending, TIMING.NOTE_AUTOSAVE_DEBOUNCE_MS);
  };

  const handleTitleChange = (val: string) => {
    setLocalTitle(val);
    scheduleSave({ title: val });
  };

  const handleContentChange = (val: string) => {
    setLocalContent(val);
    scheduleSave({ content: val });
  };

  const handleCopy = () => {
    if (!note) return;
    copy(`${localTitle ? `# ${localTitle}\n\n` : ''}${localContent}`);
  };

  // Insert markdown helper at cursor
  const insertFormatting = (prefix: string, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = localContent;
    const selected = current.substring(start, end);

    const replacement = prefix + (selected || FORMATTING_PLACEHOLDER) + suffix;
    const newContent = current.substring(0, start) + replacement + current.substring(end);

    handleContentChange(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + replacement.length - suffix.length);
    }, TIMING.EDITOR_REFOCUS_DELAY_MS);
  };

  const currentSection = sections.find((s) => s.id === note?.sectionId);

  // Empty state when no note is open in this pane
  if (!note) {
    return (
      <div
        onClick={onActivate}
        className={`h-full flex flex-col items-center justify-center p-6 border rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 transition-all ${
          isActive
            ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/20'
            : 'border-zinc-200 dark:border-zinc-800'
        }`}
      >
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
          ペイン {paneIndex + 1} は空です
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center max-w-xs mb-4">
          新しいメモを作成するか、既存のメモを選択して並行して思考を整理しましょう。
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          <button
            type="button"
            onClick={onCreateNoteInPane}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新しいメモを作成</span>
          </button>

          {allNotes.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNoteDropdownOpen(!isNoteDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 cursor-pointer"
              >
                <span>既存のメモを開く</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isNoteDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsNoteDropdownOpen(false)}
                  />
                  <div className="absolute left-0 top-full mt-1.5 w-60 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl z-40 py-1.5 max-h-56 overflow-y-auto">
                    {allNotes.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          onSelectNote(n.id);
                          setIsNoteDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 truncate flex items-center gap-2"
                      >
                        <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                        <span className="truncate">{getNoteShortLabel(n)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Starter Note Presets */}
        <div className="w-full max-w-sm border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 text-center">
            クイックテンプレートで開始
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={onCreateNoteInPane}
              className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 hover:border-indigo-400 text-left text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              <span className="font-semibold block text-indigo-600 dark:text-indigo-400 mb-0.5">💡 機能アイデア</span>
              <span className="text-[11px] text-zinc-500">ユーザーが喜ぶコア機能</span>
            </button>
            <button
              type="button"
              onClick={onCreateNoteInPane}
              className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 hover:border-indigo-400 text-left text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              <span className="font-semibold block text-purple-600 dark:text-purple-400 mb-0.5">🎯 ユーザー課題</span>
              <span className="text-[11px] text-zinc-500">誰が何を解決したいか</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEditorVisible = viewMode === 'edit' || viewMode === 'split';
  const isPreviewVisible = viewMode === 'preview' || viewMode === 'split';
  const charCount = localContent.length;
  const wordCount = localContent.trim() ? localContent.trim().split(/\s+/).length : 0;

  return (
    <div
      onClick={onActivate}
      className={`h-full flex flex-col rounded-xl bg-white dark:bg-zinc-900 border transition-all overflow-hidden ${
        isActive
          ? 'border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/15 shadow-sm'
          : 'border-zinc-200/90 dark:border-zinc-800'
      }`}
    >
      {/* Pane Top Bar */}
      <div className="h-10 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70 px-2.5 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Pane badge & Note selector dropdown */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
            P{paneIndex + 1}
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNoteDropdownOpen(!isNoteDropdownOpen)}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors max-w-[130px] sm:max-w-[180px] truncate"
              title="このペインで開くメモを切り替え"
            >
              <span className="truncate">
                {localTitle || getFirstLineText(localContent) || UNTITLED_NOTE_LABEL}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
            </button>

            {isNoteDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsNoteDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-64 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl z-40 py-1.5 max-h-64 overflow-y-auto">
                  <div className="px-3 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    メモを切り替え
                  </div>
                  {allNotes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        onSelectNote(n.id);
                        setIsNoteDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs truncate flex items-center gap-2 ${
                        n.id === note.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                      <span className="truncate">{getNoteShortLabel(n)}</span>
                    </button>
                  ))}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNoteDropdownOpen(false);
                        onCreateNoteInPane();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新規メモを作成</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Section badge / selector */}
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-700 transition-colors"
              title="所属セクションを変更"
            >
              <Folder className="w-2.5 h-2.5 text-zinc-400" />
              <span className="max-w-[80px] truncate">{currentSection?.name || '未分類'}</span>
              <ChevronDown className="w-2.5 h-2.5 text-zinc-400" />
            </button>

            {isSectionDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsSectionDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-44 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg z-40 py-1 text-xs">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onMoveNote(note.id, s.id);
                        setIsSectionDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                        s.id === note.sectionId
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 font-semibold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <FolderInput className="w-3 h-3 text-zinc-400" />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: View mode toggles & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Edit / Split / Preview */}
          <div className="flex items-center p-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800">
            {VIEW_MODE_OPTIONS.map(({ mode, title, hideOnMobile, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`${hideOnMobile ? 'hidden md:block ' : ''}p-1 rounded text-[10px] font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
                title={title}
              >
                <Icon className="w-3 h-3" />
              </button>
            ))}
          </div>

          {/* Quick Structure Rough Note */}
          {onStructureNote && (
            <button
              type="button"
              onClick={() => onStructureNote(note.id)}
              className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 rounded hover:bg-amber-100/60 dark:hover:bg-amber-950/40 transition-colors"
              title="このメモの殴り書きをPRD構造化テキストに変換"
            >
              <Wand2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
            title="Markdownをコピー"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Delete note */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('このメモを削除してもよろしいですか？')) {
                onDeleteNote(note.id);
              }
            }}
            className="p-1 text-zinc-400 hover:text-rose-500 rounded hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors"
            title="メモを削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Note Title Input */}
      <div className="px-3 pt-3 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
        <input
          type="text"
          placeholder="無題のノート (タイトルが空でも本文の1行目で表示されます)"
          value={localTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full text-base font-bold bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400/80 tracking-tight"
        />
      </div>

      {/* Formatting Toolbar (shown when in edit or split mode) */}
      {isEditorVisible && (
        <div className="px-3 py-1 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/40 flex items-center gap-1 text-zinc-500 overflow-x-auto">
          {FORMATTING_ACTIONS.map((action, index) =>
            action === 'divider' ? (
              <div key={`divider-${index}`} className="w-px h-3 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
            ) : (
              <button
                key={action.title}
                type="button"
                onClick={() => insertFormatting(action.prefix, action.suffix)}
                className="p-1 hover:text-zinc-900 dark:hover:text-zinc-100 rounded hover:bg-zinc-200/50 dark:hover:bg-zinc-800"
                title={action.title}
              >
                <action.Icon className="w-3 h-3" />
              </button>
            )
          )}
        </div>
      )}

      {/* Editor & Preview Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Editor Area */}
        {isEditorVisible && (
          <div className="flex-1 flex flex-col min-w-0 h-full p-3 overflow-hidden">
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="思いついたことを自由に書いてください... (Markdown記法をサポート)"
              className="w-full flex-1 resize-none bg-transparent border-none outline-none text-xs sm:text-sm font-sans text-zinc-800 dark:text-zinc-200 leading-relaxed placeholder-zinc-400 overflow-y-auto"
            />
          </div>
        )}

        {/* Divider if split */}
        {viewMode === 'split' && (
          <div className="w-px bg-zinc-200 dark:bg-zinc-800 shrink-0" />
        )}

        {/* Preview Area */}
        {isPreviewVisible && (
          <div className="flex-1 min-w-0 h-full p-4 overflow-y-auto bg-zinc-50/30 dark:bg-zinc-950/20">
            <MarkdownRenderer content={localContent} />
          </div>
        )}
      </div>

      {/* Pane Bottom Status Bar */}
      <div className="h-6 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 px-3 flex items-center justify-between text-[10px] text-zinc-400 shrink-0">
        <span>{new Date(note.updatedAt).toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit' })} 更新</span>
        <div className="flex items-center gap-2">
          <span>{charCount} 文字</span>
          <span>•</span>
          <span>{wordCount} 単語</span>
        </div>
      </div>
    </div>
  );
};
