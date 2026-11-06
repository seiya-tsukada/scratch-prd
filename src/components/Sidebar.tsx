import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Copy,
  Sparkles,
  ExternalLink,
  StickyNote,
  Settings2,
} from 'lucide-react';
import { Note, PrdDocument, PaneInfo, Tag } from '../types';
import { tagChipClass } from '../config/tags';
import { filterNotesByTags, sortTags } from '../utils/tags';
import { TagChip } from './TagEditor';
import { DATE_LOCALE } from '../config/app';
import { getPrdModeMeta } from '../config/prd';
import { getNoteDisplayTitle } from '../utils/note';

/** サイドバーのタブ: メモの一覧 / PRD の一覧 */
export type SidebarTab = 'notes' | 'prds';

const byUpdatedAtDesc = <T extends { updatedAt: string }>(a: T, b: T) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

const formatShortDate = (value: string) =>
  new Date(value).toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric' });

interface SidebarProps {
  notes: Note[];
  tags: Tag[];
  prds: PrdDocument[];
  panes: PaneInfo[];
  activePaneId: string;
  isOpen: boolean;
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  onSelectNote: (noteId: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onDuplicateNote: (noteId: string) => void;
  onOpenPrd: (prdId: string) => void;
  onOpenTagManager: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  tags,
  prds,
  panes,
  isOpen,
  activeTab,
  onChangeTab,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onDuplicateNote,
  onOpenPrd,
  onOpenTagManager,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuNoteId, setActiveMenuNoteId] = useState<string | null>(null);
  // タグでの絞り込み（複数選択は AND）
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);

  // メモ ID → そのメモを表示しているペイン番号
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

  const query = searchQuery.trim().toLowerCase();

  const sortedTags = useMemo(() => sortTags(tags), [tags]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  // 削除されたタグは選択から外す
  const activeFilterIds = filterTagIds.filter((id) => tagById.has(id));

  const visibleNotes = useMemo(
    () =>
      filterNotesByTags(notes, activeFilterIds)
        .filter((n) => !query || n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query))
        .sort(byUpdatedAtDesc),
    [notes, query, activeFilterIds.join(',')]
  );

  const toggleFilter = (tagId: string) =>
    setFilterTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));

  const visiblePrds = useMemo(
    () =>
      prds
        .filter((p) => !query || p.title.toLowerCase().includes(query) || p.content.toLowerCase().includes(query))
        .sort(byUpdatedAtDesc),
    [prds, query]
  );

  if (!isOpen) return null;

  const tabs: { key: SidebarTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] =
    [
      { key: 'notes', label: 'メモ', count: notes.length, Icon: StickyNote },
      { key: 'prds', label: 'PRD', count: prds.length, Icon: FileText },
    ];

  return (
    <aside className="w-64 sm:w-72 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 backdrop-blur-md flex flex-col shrink-0 select-none overflow-hidden h-[calc(100vh-3.5rem)]">
      <div className="p-3 border-b border-zinc-200/80 dark:border-zinc-800/80 space-y-2">
        <button
          type="button"
          onClick={onCreateNote}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-xs shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>新しいメモを書く</span>
        </button>

        {/* メモ / PRD の切り替え */}
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800" role="tablist">
          {tabs.map(({ key, label, count, Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => onChangeTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === key
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              <span className="text-[10px] px-1 rounded bg-zinc-200/80 dark:bg-zinc-900/60 text-zinc-500">
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder={activeTab === 'notes' ? 'メモを検索...' : 'PRDを検索...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {activeTab === 'notes' && (
        <div className="px-3 py-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-zinc-400">
              タグで絞り込み{activeFilterIds.length > 1 ? '（すべてを含む）' : ''}
            </span>
            <div className="flex items-center gap-1">
              {activeFilterIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTagIds([])}
                  className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  解除
                </button>
              )}
              <button
                type="button"
                onClick={onOpenTagManager}
                className="p-0.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded"
                title="タグの管理（名前の変更・色・削除）"
                aria-label="タグの管理"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {sortedTags.length === 0 ? (
            <p className="text-[10px] text-zinc-400">メモにタグを付けると、ここで絞り込めます。</p>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {sortedTags.map((tag) => {
                const selected = activeFilterIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleFilter(tag.id)}
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-medium max-w-[9rem] truncate transition-opacity ${tagChipClass(tag.color)} ${
                      selected ? 'ring-2 ring-indigo-500/70' : activeFilterIds.length > 0 ? 'opacity-50 hover:opacity-100' : ''
                    }`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {activeTab === 'notes' ? (
          <div className="space-y-0.5">
            {visibleNotes.map((note) => {
              const openPanes = openNotePanes.get(note.id);
              return (
                <div
                  key={note.id}
                  className="group relative flex items-center justify-between gap-1 px-2 py-1.5 rounded-md hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 text-xs cursor-pointer transition-colors"
                  onClick={() => onSelectNote(note.id)}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                        {getNoteDisplayTitle(note.title, note.content)}
                      </span>
                      {(note.tagIds?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {note.tagIds
                            .map((id) => tagById.get(id))
                            .filter((t): t is Tag => Boolean(t))
                            .map((tag) => (
                              <TagChip key={tag.id} tag={tag} size="xs" />
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-400 shrink-0 group-hover:hidden">
                    {formatShortDate(note.updatedAt)}
                  </span>

                  <div className="hidden group-hover:flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuNoteId(activeMenuNoteId === note.id ? null : note.id);
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded"
                      aria-label="メモの操作"
                    >
                      <MoreVertical className="w-3 h-3" />
                    </button>
                  </div>

                  {activeMenuNoteId === note.id && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuNoteId(null);
                        }}
                      />
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-40 py-1 text-xs">
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('このメモを削除してもよろしいですか？（このメモから作った PRD は残ります）')) {
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
                    </>
                  )}
                </div>
              );
            })}

            {visibleNotes.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400 italic">
                {query || activeFilterIds.length > 0
                  ? '条件に一致するメモがありません'
                  : 'まだメモがありません。「新しいメモを書く」から始めましょう。'}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {visiblePrds.map((prd) => {
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
                    <span className="text-zinc-400">{formatShortDate(prd.updatedAt)}</span>
                    <span className="text-zinc-400 ml-auto flex items-center gap-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      開く
                      <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              );
            })}

            {visiblePrds.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400 italic bg-zinc-100/50 dark:bg-zinc-900/50 rounded-lg flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                <span>{query ? '一致するPRDがありません' : 'まだPRDはありません。「PRD生成」から作成できます。'}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
