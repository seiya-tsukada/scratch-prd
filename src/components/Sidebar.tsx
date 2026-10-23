import React, { useState, useMemo } from 'react';
import {
  Inbox,
  Users,
  Lightbulb,
  FileText,
  Folder,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Copy,
  FolderInput,
  Edit2,
  ChevronRight,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { Section, Note, PrdDocument, PaneInfo } from '../types';
import { DATE_LOCALE, INBOX_SECTION_KEYWORD } from '../config/app';
import { getPrdModeMeta } from '../config/prd';
import { getNoteDisplayTitle } from '../utils/note';

/** セクション名に含まれるキーワード（小文字比較）からアイコンを決める。上から順に評価 */
const SECTION_ICON_RULES: { keywords: string[]; Icon: React.ComponentType<{ className?: string }> }[] = [
  { keywords: ['inbox', '思いつき'], Icon: Inbox },
  { keywords: ['problem', 'user', '課題'], Icon: Users },
  { keywords: ['feature', 'idea', '機能'], Icon: Lightbulb },
  { keywords: ['prd', '仕様'], Icon: FileText },
];

const SectionIcon: React.FC<{ name: string }> = ({ name }) => {
  const lower = name.toLowerCase();
  const Icon =
    SECTION_ICON_RULES.find((rule) => rule.keywords.some((k) => lower.includes(k)))?.Icon ?? Folder;
  return <Icon className="w-3.5 h-3.5" />;
};

interface SidebarProps {
  sections: Section[];
  notes: Note[];
  prds: PrdDocument[];
  panes: PaneInfo[];
  activePaneId: string;
  isOpen: boolean;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (sectionId?: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDuplicateNote: (noteId: string) => void;
  onMoveNote: (noteId: string, targetSectionId: string) => void;
  onCreateSection: (name: string) => void;
  onRenameSection: (sectionId: string, newName: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onOpenPrd: (prdId: string) => void;
  onOpenSupabaseGuide: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sections,
  notes,
  prds,
  panes,
  isOpen,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onDuplicateNote,
  onMoveNote,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
  onOpenPrd,
  onOpenSupabaseGuide,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [activeMenuNoteId, setActiveMenuNoteId] = useState<string | null>(null);
  const [activeMenuSectionId, setActiveMenuSectionId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  // Map note IDs to the panes that are currently displaying them
  const openNotePanes = useMemo(() => {
    const map = new Map<string, number[]>();
    panes.forEach((pane, index) => {
      if (pane.noteId) {
        const arr = map.get(pane.noteId) || [];
        arr.push(index + 1);
        map.set(pane.noteId, arr);
      }
    });
    return map;
  }, [panes]);

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddSection = () => {
    if (newSectionName.trim()) {
      onCreateSection(newSectionName.trim());
      setNewSectionName('');
      setIsAddingSection(false);
    }
  };

  const handleFinishRenameSection = (id: string) => {
    if (editingSectionName.trim()) {
      onRenameSection(id, editingSectionName.trim());
    }
    setEditingSectionId(null);
  };

  // Filter notes by search
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  if (!isOpen) return null;

  return (
    <aside className="w-64 sm:w-72 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 backdrop-blur-md flex flex-col shrink-0 select-none overflow-hidden h-[calc(100vh-3.5rem)]">
      {/* Top Capture Button */}
      <div className="p-3 border-b border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
        <button
          type="button"
          onClick={() => {
            const inbox = sections.find((s) => s.name.toLowerCase().includes(INBOX_SECTION_KEYWORD)) || sections[0];
            onCreateNote(inbox ? inbox.id : undefined);
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-xs shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>新しいメモを書く (Inbox)</span>
        </button>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="ノートを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Content Area: Sections, Notes, and PRDs */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {/* Sections and Notes */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              <span>セクション / メモ</span>
            </span>
            <button
              type="button"
              onClick={() => setIsAddingSection(true)}
              className="text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
              title="新規セクションを追加"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* New Section Input */}
          {isAddingSection && (
            <div className="p-2 mb-2 bg-white dark:bg-zinc-900 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                placeholder="セクション名を入力..."
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSection();
                  if (e.key === 'Escape') setIsAddingSection(false);
                }}
                className="flex-1 text-xs bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleAddSection}
                className="px-2 py-1 text-[11px] font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500"
              >
                追加
              </button>
            </div>
          )}

          {/* Sections List */}
          <div className="space-y-1">
            {sections.map((section) => {
              const sectionNotes = filteredNotes.filter((n) => n.sectionId === section.id);
              const isCollapsed = collapsedSections[section.id];
              const isEditing = editingSectionId === section.id;

              return (
                <div key={section.id} className="rounded-lg overflow-hidden">
                  {/* Section Header */}
                  <div className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors text-xs text-zinc-700 dark:text-zinc-300">
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        onBlur={() => handleFinishRenameSection(section.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRenameSection(section.id);
                          if (e.key === 'Escape') setEditingSectionId(null);
                        }}
                        className="flex-1 px-1 py-0.5 text-xs rounded bg-white dark:bg-zinc-800 border border-indigo-500 text-zinc-900 dark:text-zinc-100 outline-none"
                      />
                    ) : (
                      <div
                        className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer"
                        onClick={() => toggleSection(section.id)}
                      >
                        <span className="text-zinc-400">
                          {isCollapsed ? (
                            <ChevronRight className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          <SectionIcon name={section.name} />
                        </span>
                        <span className="font-medium truncate">{section.name}</span>
                        <span className="text-[10px] text-zinc-400 ml-1 px-1 rounded bg-zinc-200/60 dark:bg-zinc-800/80">
                          {sectionNotes.length}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateNote(section.id);
                        }}
                        className="p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-zinc-300/50 dark:hover:bg-zinc-700/50"
                        title="このセクションにメモを追加"
                      >
                        <Plus className="w-3 h-3" />
                      </button>

                      {/* Section context menu */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuSectionId(
                              activeMenuSectionId === section.id ? null : section.id
                            );
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded hover:bg-zinc-300/50 dark:hover:bg-zinc-700/50"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>

                        {activeMenuSectionId === section.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuSectionId(null);
                              }}
                            />
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-40 py-1 text-xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSectionId(section.id);
                                  setEditingSectionName(section.name);
                                  setActiveMenuSectionId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>名前を変更</span>
                              </button>
                              {sections.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      sectionNotes.length === 0 ||
                                      window.confirm(
                                        `このセクション内の ${sectionNotes.length} 件のメモも削除されます。本当に削除しますか？`
                                      )
                                    ) {
                                      onDeleteSection(section.id);
                                    }
                                    setActiveMenuSectionId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>セクションを削除</span>
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes List inside this Section */}
                  {!isCollapsed && (
                    <div className="pl-5 pr-1 py-0.5 space-y-0.5">
                      {sectionNotes.map((note) => {
                        const openPanes = openNotePanes.get(note.id);
                        const displayTitle = getNoteDisplayTitle(note.title, note.content);

                        return (
                          <div
                            key={note.id}
                            className="group relative flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 text-xs cursor-pointer transition-colors"
                            onClick={() => onSelectNote(note.id)}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {/* Open Pane indicator pills */}
                              {openPanes && openPanes.length > 0 && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {openPanes.map((pNum) => (
                                    <span
                                      key={pNum}
                                      className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-500 text-white"
                                      title={`ペイン ${pNum} に表示中`}
                                    >
                                      P{pNum}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <span className="truncate text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                                {displayTitle}
                              </span>
                            </div>

                            {/* Note options menu */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuNoteId(
                                    activeMenuNoteId === note.id ? null : note.id
                                  );
                                }}
                                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded"
                              >
                                <MoreVertical className="w-3 h-3" />
                              </button>

                              {activeMenuNoteId === note.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuNoteId(null);
                                    }}
                                  />
                                  <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-40 py-1 text-xs">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDuplicateNote(note.id);
                                        setActiveMenuNoteId(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                                    >
                                      <Copy className="w-3 h-3" />
                                      <span>複製する</span>
                                    </button>

                                    {/* Move to another section */}
                                    <div className="border-t border-zinc-100 dark:border-zinc-800/80 my-1 pt-1">
                                      <div className="px-3 py-1 text-[10px] text-zinc-400 uppercase font-semibold">
                                        セクションを移動
                                      </div>
                                      {sections.map((s) => (
                                        <button
                                          key={s.id}
                                          type="button"
                                          disabled={s.id === note.sectionId}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onMoveNote(note.id, s.id);
                                            setActiveMenuNoteId(null);
                                          }}
                                          className={`w-full flex items-center gap-2 px-3 py-1 text-left ${
                                            s.id === note.sectionId
                                              ? 'opacity-40 cursor-not-allowed text-zinc-400'
                                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                          }`}
                                        >
                                          <FolderInput className="w-3 h-3" />
                                          <span className="truncate">{s.name}</span>
                                        </button>
                                      ))}
                                    </div>

                                    <div className="border-t border-zinc-100 dark:border-zinc-800/80 mt-1 pt-1">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm('このメモを削除してもよろしいですか？')) {
                                            onDeleteNote(note.id);
                                          }
                                          setActiveMenuNoteId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>削除</span>
                                      </button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {sectionNotes.length === 0 && (
                        <div className="px-2 py-1.5 text-[11px] text-zinc-400 italic">
                          メモがありません (+ を押して追加)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PRD Documents Section */}
        <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span>生成されたPRD ({prds.length})</span>
            </span>
          </div>

          <div className="space-y-1">
            {prds.map((prd) => {
              const modeMeta = getPrdModeMeta(prd.generationMode);

              return (
                <div
                  key={prd.id}
                  onClick={() => onOpenPrd(prd.id)}
                  className="group flex flex-col px-2.5 py-2 rounded-lg hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate flex-1">
                      {prd.title}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
                      v{prd.version || 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className={`px-1.5 py-0.2 rounded font-medium ${modeMeta.badgeClass}`}>
                      {modeMeta.shortLabel}モード
                    </span>
                    <span className="text-zinc-400">
                      {new Date(prd.updatedAt).toLocaleDateString(DATE_LOCALE, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="text-zinc-400 ml-auto flex items-center gap-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      開く
                      <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              );
            })}

            {prds.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400 italic bg-zinc-100/50 dark:bg-zinc-900/50 rounded-lg">
                まだPRDはありません。「AIでPRD生成」から作成できます。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Info & Supabase sync badge */}
      <div className="p-2.5 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-100/50 dark:bg-zinc-900/50 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onOpenSupabaseGuide}
          className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Supabase Auth & RLS ready</span>
        </button>
      </div>
    </aside>
  );
};
