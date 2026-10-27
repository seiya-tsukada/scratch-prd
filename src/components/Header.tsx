import React, { useState } from 'react';
import {
  Sparkles,
  LayoutGrid,
  Columns,
  Square,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FolderOpen,
  Plus,
  Trash2,
  Menu,
  ChevronDown,
  Edit2,
  Wand2,
} from 'lucide-react';
import { Project, PaneCount, SaveStatus } from '../types';

const ThreeColumnsIcon = () => (
  <div className="flex gap-0.5 w-3.5 h-3.5 items-center justify-center">
    <div className="w-1 h-3 bg-current rounded-xs" />
    <div className="w-1 h-3 bg-current rounded-xs" />
    <div className="w-1 h-3 bg-current rounded-xs" />
  </div>
);

const PANE_LAYOUT_OPTIONS: {
  count: PaneCount;
  title: string;
  hideOnMobile: boolean;
  icon: React.ReactNode;
}[] = [
  { count: 1, title: '1ペイン (単一表示)', hideOnMobile: false, icon: <Square className="w-3.5 h-3.5" /> },
  { count: 2, title: '2ペイン (左右分割)', hideOnMobile: false, icon: <Columns className="w-3.5 h-3.5" /> },
  { count: 3, title: '3ペイン (3分割表示)', hideOnMobile: true, icon: <ThreeColumnsIcon /> },
  { count: 4, title: '4ペイン (2x2 グリッド分割)', hideOnMobile: true, icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

const SAVE_STATUS_BADGE: Record<SaveStatus, React.ReactNode> = {
  saving: (
    <>
      <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
      <span className="text-zinc-600 dark:text-zinc-400">保存中...</span>
    </>
  ),
  saved: (
    <>
      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      <span className="text-zinc-600 dark:text-zinc-400">自動保存完了</span>
    </>
  ),
  error: (
    <>
      <AlertCircle className="w-3 h-3 text-rose-500" />
      <span className="text-rose-500 font-semibold">保存失敗</span>
    </>
  ),
};

interface HeaderProps {
  currentProject: Project;
  projects: Project[];
  paneCount: PaneCount;
  saveStatus: SaveStatus;
  selectedNotesCount: number;
  sidebarOpen: boolean;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (newName: string) => void;
  onDeleteProject: (projectId: string) => void;
  onChangePaneCount: (count: PaneCount) => void;
  onOpenStructureRoughNote: () => void;
  onOpenPrdGenerator: () => void;
  /** 保存に失敗したメモをもう一度保存する */
  onRetrySave: () => void;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentProject,
  projects,
  paneCount,
  saveStatus,
  selectedNotesCount,
  sidebarOpen,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onChangePaneCount,
  onOpenStructureRoughNote,
  onOpenPrdGenerator,
  onRetrySave,
  onToggleSidebar,
}) => {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(currentProject.name);

  const handleFinishRename = () => {
    if (editNameValue.trim() && editNameValue !== currentProject.name) {
      onRenameProject(editNameValue.trim());
    }
    setIsEditingName(false);
  };

  return (
    <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-3.5 flex items-center justify-between gap-3 shrink-0 z-20 select-none">
      {/* Left side: Sidebar Toggle & Project Selector */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title={sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く'}
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Project Selector Dropdown */}
        <div className="relative">
          <div className="flex items-center">
            {isEditingName ? (
              <input
                type="text"
                autoFocus
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRename();
                  if (e.key === 'Escape') {
                    setEditNameValue(currentProject.name);
                    setIsEditingName(false);
                  }
                }}
                className="px-2 py-1 text-sm font-semibold rounded-md border border-indigo-400 dark:border-indigo-500 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setProjectMenuOpen(!projectMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors max-w-[240px] md:max-w-[320px] truncate"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{currentProject.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-0.5" />
              </button>
            )}

            {!isEditingName && (
              <button
                type="button"
                onClick={() => {
                  setEditNameValue(currentProject.name);
                  setIsEditingName(true);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 ml-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="プロジェクト名を変更"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Project Dropdown Menu */}
          {projectMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setProjectMenuOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl z-40 py-1.5 overflow-hidden">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  プロジェクト一覧
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-3 py-2 text-xs cursor-pointer ${
                        p.id === currentProject.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                      }`}
                      onClick={() => {
                        onSelectProject(p.id);
                        setProjectMenuOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                        <span className="truncate">{p.name}</span>
                      </div>
                      {projects.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`「${p.name}」を削除してもよろしいですか？`)) {
                              onDeleteProject(p.id);
                            }
                          }}
                          className="text-zinc-400 hover:text-rose-500 p-1 rounded hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-100 dark:border-zinc-800/80 pt-1 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onCreateProject();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新規プロジェクトを作成</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Save Status Badge（失敗時はクリックで再試行） */}
        <button
          type="button"
          onClick={saveStatus === 'error' ? onRetrySave : undefined}
          disabled={saveStatus !== 'error'}
          title={saveStatus === 'error' ? 'クリックして保存を再試行' : undefined}
          className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 enabled:hover:border-rose-300 enabled:cursor-pointer disabled:cursor-default"
        >
          {SAVE_STATUS_BADGE[saveStatus]}
          {saveStatus === 'error' && <span className="text-rose-500 underline">再試行</span>}
        </button>
      </div>

      {/* Right side: Pane switcher & AI PRD Action */}
      <div className="flex items-center gap-2">
        {/* Pane Split Switcher Buttons */}
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/60">
          {PANE_LAYOUT_OPTIONS.map(({ count, title, hideOnMobile, icon }) => (
            <button
              key={count}
              type="button"
              onClick={() => onChangePaneCount(count)}
              className={`${hideOnMobile ? 'hidden md:block ' : ''}p-1.5 rounded-md transition-all ${
                paneCount === count
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
              title={title}
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Action 1: 殴り書きをPRD構造化テキストに修正 */}
        <button
          type="button"
          onClick={onOpenStructureRoughNote}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/70 hover:bg-amber-200 dark:hover:bg-amber-900/80 border border-amber-300/80 dark:border-amber-800/80 shadow-2xs active:scale-[0.98] transition-all cursor-pointer"
          title="殴り書きのメモをPRD形式の構造化テキストに即時整形"
        >
          <Wand2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="hidden sm:inline">殴り書きを</span>
          <span>構造化</span>
        </button>

        {/* Action 2: PRD生成 (既存) */}
        <button
          type="button"
          onClick={onOpenPrdGenerator}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-xs shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
          title="複数メモを横断して本格的なPRD仕様書を高速生成"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>PRD生成</span>
          {selectedNotesCount > 0 && (
            <span className="hidden sm:inline-block ml-0.5 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
              {selectedNotesCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
