import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, FolderPlus, Loader2, X } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { PrdGeneratorModal, PrdGenerateParams } from './components/PrdGeneratorModal';
import { StructureRoughNoteModal } from './components/StructureRoughNoteModal';
import { PrdViewerModal } from './components/PrdViewerModal';
import { LegacyImportDialog } from './components/LegacyImportDialog';
import { ProjectData, PrdInput, workspaceRepository } from './services/apiWorkspaceRepository';
import { NoteSaveQueue } from './services/noteSaveQueue';
import { clearLegacyData, findLegacyProjects, LegacyProjectSummary, removeLegacyProject } from './services/legacyImport';
import { generatePrd } from './services/apiClient';
import { AI_INPUT_LIMITS, FallbackReason } from './config/api';
import {
  APP_NAME,
  DEFAULT_ACTIVE_PANE_ID,
  DEFAULT_PANE_COUNT,
  FALLBACK_PROJECT_NAME,
  INBOX_SECTION_KEYWORD,
  QUICK_CAPTURE_SHORTCUT_KEY,
  TIMING,
  UNTITLED_SHORT_LABEL,
  createEmptyPanes,
} from './config/app';
import { LAST_PROJECT_STORAGE_KEY } from './config/legacyStorage';
import { getPrdModeMeta } from './config/prd';
import { Project, Section, Note, PrdDocument, PaneCount, PaneInfo, SaveStatus } from './types';

type LoadState = 'loading' | 'ready' | 'error';

const CONFLICT_COPY_SUFFIX = '（競合コピー）';
const DUPLICATE_SUFFIX = ' (コピー)';

/** 接尾辞を付けたタイトルが保存上限（AI の入力上限と同じ 200 文字）を超えないようにする */
const withSuffix = (title: string, suffix: string) =>
  title.slice(0, AI_INPUT_LIMITS.MAX_TITLE_CHARS - suffix.length) + suffix;
const CONFLICT_NOTICE =
  '他の画面で先に更新されていたため、最新の内容を表示しました。入力していた内容は「（競合コピー）」として別のメモに保存しました。';

/** 最後に開いていたプロジェクト（表示の利便のためだけ。読めなくても動く） */
const lastProject = {
  get: (): string | undefined => {
    try {
      return localStorage.getItem(LAST_PROJECT_STORAGE_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (projectId: string) => {
    try {
      localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId);
    } catch {
      // 保存できなくても動作に影響しない
    }
  },
};

const toPrdInput = (prd: PrdDocument): PrdInput => ({
  title: prd.title,
  content: prd.content,
  generationMode: prd.generationMode,
  detailLevel: prd.detailLevel,
  sourceNoteIds: prd.sourceNoteIds,
  facts: prd.facts,
  proposals: prd.proposals,
  openQuestions: prd.openQuestions,
  contradictions: prd.contradictions,
});

export default function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  // Active project data
  const [sections, setSections] = useState<Section[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [prds, setPrds] = useState<PrdDocument[]>([]);
  // 競合で最新の内容を取り込んだメモ。値が変わると NotePane が入力中の内容を読み直す
  const [noteRevisions, setNoteRevisions] = useState<Record<string, number>>({});

  // Workspace pane preferences
  const [paneCount, setPaneCount] = useState<PaneCount>(DEFAULT_PANE_COUNT);
  const [panes, setPanes] = useState<PaneInfo[]>(createEmptyPanes);
  const [activePaneId, setActivePaneId] = useState<string>(DEFAULT_ACTIVE_PANE_ID);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isPrdGeneratorOpen, setIsPrdGeneratorOpen] = useState(false);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [generatorTargetPrdId, setGeneratorTargetPrdId] = useState<string | null>(null);
  const [activePrdId, setActivePrdId] = useState<string | null>(null);
  // 直前の PRD 生成が内蔵ジェネレータによるものだった場合に、ビューアで知らせる
  const [prdFallback, setPrdFallback] = useState<{ prdId: string; reason: FallbackReason } | null>(null);
  const [legacyProjects, setLegacyProjects] = useState<LegacyProjectSummary[]>([]);

  const showError = (e: unknown) => {
    console.error(e);
    setErrorMessage(e instanceof Error && e.message ? e.message : '操作に失敗しました。もう一度お試しください。');
  };

  // --- メモの自動保存 ---
  const currentProjectRef = useRef<Project | undefined>(currentProject);
  currentProjectRef.current = currentProject;

  const saveQueueRef = useRef<NoteSaveQueue | null>(null);
  saveQueueRef.current ??= new NoteSaveQueue({
    save: (noteId, updates, baseUpdatedAt) => workspaceRepository.updateNote(noteId, updates, baseUpdatedAt),
    onStatusChange: setSaveStatus,
    onSaved: (saved) =>
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? { ...n, updatedAt: saved.updatedAt } : n))),
    onConflict: (latest, unsaved) => {
      setNotes((prev) => prev.map((n) => (n.id === latest.id ? latest : n)));
      setNoteRevisions((prev) => ({ ...prev, [latest.id]: (prev[latest.id] ?? 0) + 1 }));
      // 入力していた内容は失わないよう、別のメモとして残す
      if (unsaved.title === undefined && unsaved.content === undefined) return;
      const title = withSuffix((unsaved.title ?? latest.title) || UNTITLED_SHORT_LABEL, CONFLICT_COPY_SUFFIX);
      workspaceRepository
        .createNote(latest.projectId, latest.sectionId, title, unsaved.content ?? latest.content)
        .then((copy) => {
          if (currentProjectRef.current?.id === copy.projectId) {
            saveQueueRef.current?.track([copy]);
            setNotes((prev) => [copy, ...prev]);
          }
          setErrorMessage(CONFLICT_NOTICE);
        })
        .catch(showError);
    },
  });
  const saveQueue = saveQueueRef.current;

  // 未保存の変更があるまま閉じようとしたら警告する
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveQueue.hasUnsaved()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveQueue]);

  // --- 読み込み ---
  const applyProjectData = useCallback(
    (data: ProjectData) => {
      const { preferences: prefs } = data;
      saveQueue.track(data.notes);
      setSections(data.sections);
      setNotes(data.notes);
      setPrds(data.prds);
      setPaneCount(prefs.paneCount);

      // 存在しないメモを指すペインには先頭から順にメモを割り当てる
      const validPanes = prefs.panes.map((pane, idx) =>
        data.notes.some((n) => n.id === pane.noteId) ? pane : { ...pane, noteId: data.notes[idx]?.id || null }
      );
      setPanes(validPanes);
      setActivePaneId(prefs.activePaneId || validPanes[0]?.id || DEFAULT_ACTIVE_PANE_ID);
    },
    [saveQueue]
  );

  const clearProjectData = () => {
    setSections([]);
    setNotes([]);
    setPrds([]);
    setPanes(createEmptyPanes());
  };

  const loadWorkspace = useCallback(
    async (projectId?: string) => {
      const result = await workspaceRepository.bootstrap(projectId);
      setProjects(result.projects);
      setCurrentProjectId(result.currentProjectId ?? null);
      if (result.data) applyProjectData(result.data);
      else clearProjectData();
      if (result.currentProjectId) lastProject.set(result.currentProjectId);
    },
    [applyProjectData]
  );

  useEffect(() => {
    loadWorkspace(lastProject.get())
      .then(() => {
        setLoadState('ready');
        setLegacyProjects(findLegacyProjects());
      })
      .catch((e) => {
        console.error(e);
        setLoadState('error');
      });
  }, [loadWorkspace]);

  const handleSelectProject = async (projectId: string) => {
    try {
      applyProjectData(await workspaceRepository.getProjectData(projectId));
      setCurrentProjectId(projectId);
      lastProject.set(projectId);
    } catch (e) {
      showError(e);
    }
  };

  // ペイン構成の保存（デバウンス）。失敗しても作業は止めない
  const savePrefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePreferences = useCallback(
    (newCount: PaneCount, newPanes: PaneInfo[], newActivePaneId: string) => {
      if (!currentProject) return;
      const projectId = currentProject.id;
      if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
      savePrefsTimer.current = setTimeout(() => {
        workspaceRepository
          .savePreferences(projectId, { paneCount: newCount, panes: newPanes, activePaneId: newActivePaneId })
          .catch((e) => console.warn('ワークスペース設定を保存できませんでした', e));
      }, TIMING.PREFERENCES_SAVE_DEBOUNCE_MS);
    },
    [currentProject]
  );

  const getActivePaneIndex = () => {
    const index = panes.findIndex((p) => p.id === activePaneId);
    return index !== -1 ? index : 0;
  };

  // --- Panes ---
  const handleChangePaneCount = (count: PaneCount) => {
    setPaneCount(count);
    savePreferences(count, panes, activePaneId);
  };

  const handleSelectNoteInPane = (paneIndex: number, noteId: string) => {
    setPanes((prev) => {
      const next = [...prev];
      next[paneIndex] = { ...next[paneIndex], noteId };
      savePreferences(paneCount, next, activePaneId);
      return next;
    });
  };

  /** サイドバー等から開くメモはアクティブなペインに表示する */
  const handleOpenNoteInActivePane = (noteId: string) => {
    handleSelectNoteInPane(getActivePaneIndex(), noteId);
  };

  const handleActivatePane = (paneId: string) => {
    setActivePaneId(paneId);
    savePreferences(paneCount, panes, paneId);
  };

  // --- Notes ---
  const addNote = (note: Note) => {
    saveQueue.track([note]);
    setNotes((prev) => [note, ...prev]);
  };

  const handleCreateNoteInPane = async (paneIndex: number, sectionId?: string) => {
    if (!currentProject) return;
    const targetSectionId =
      sectionId ||
      sections.find((s) => s.name.toLowerCase().includes(INBOX_SECTION_KEYWORD))?.id ||
      sections[0]?.id;
    if (!targetSectionId) {
      setErrorMessage('メモを作成するには、先にセクションを作成してください。');
      return;
    }

    try {
      const newNote = await workspaceRepository.createNote(currentProject.id, targetSectionId);
      addNote(newNote);
      setPanes((prev) => {
        const next = [...prev];
        next[paneIndex] = { ...next[paneIndex], noteId: newNote.id };
        savePreferences(paneCount, next, next[paneIndex].id);
        return next;
      });
      setActivePaneId(panes[paneIndex].id);
    } catch (e) {
      showError(e);
    }
  };

  /** サイドバー / ショートカットからの即時メモ作成 */
  const handleFastCapture = (sectionId?: string) => {
    void handleCreateNoteInPane(getActivePaneIndex(), sectionId);
  };

  /** 画面は即座に更新し、保存はキューに任せる */
  const handleUpdateNote = (noteId: string, updates: Partial<Note>) => {
    const { title, content, sectionId } = updates;
    const fields = Object.fromEntries(
      Object.entries({ title, content, sectionId }).filter(([, value]) => value !== undefined)
    );
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, ...fields } : n)));
    saveQueue.enqueue(noteId, fields);
  };

  const removeNotesLocally = (removedIds: string[]) => {
    removedIds.forEach((id) => saveQueue.forget(id));
    const replacementId = notes.find((n) => !removedIds.includes(n.id))?.id ?? null;
    setNotes((prev) => prev.filter((n) => !removedIds.includes(n.id)));
    // 削除したメモを開いていたペインは先頭のメモに切り替える
    setPanes((prev) =>
      prev.map((p) => (p.noteId && removedIds.includes(p.noteId) ? { ...p, noteId: replacementId } : p))
    );
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await workspaceRepository.deleteNote(noteId);
      removeNotesLocally([noteId]);
    } catch (e) {
      showError(e);
    }
  };

  const handleDuplicateNote = async (noteId: string) => {
    if (!currentProject) return;
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    try {
      const dup = await workspaceRepository.createNote(
        currentProject.id,
        target.sectionId,
        withSuffix(target.title || UNTITLED_SHORT_LABEL, DUPLICATE_SUFFIX),
        target.content
      );
      addNote(dup);
      handleOpenNoteInActivePane(dup.id);
    } catch (e) {
      showError(e);
    }
  };

  const handleMoveNote = (noteId: string, targetSectionId: string) => {
    handleUpdateNote(noteId, { sectionId: targetSectionId });
  };

  // --- Projects ---
  const handleCreateProject = async () => {
    const name = window.prompt('新しいプロジェクト名を入力してください:');
    if (!name || !name.trim()) return;
    try {
      const newProj = await workspaceRepository.createProject(name.trim());
      setProjects((prev) => [newProj, ...prev]);
      await handleSelectProject(newProj.id);
    } catch (e) {
      showError(e);
    }
  };

  const handleRenameProject = async (newName: string) => {
    if (!currentProject) return;
    try {
      const updated = await workspaceRepository.updateProject(currentProject.id, { name: newName });
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      showError(e);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await workspaceRepository.deleteProject(projectId);
      const remaining = projects.filter((p) => p.id !== projectId);
      setProjects(remaining);
      if (projectId !== currentProject?.id) return;
      if (remaining.length > 0) {
        await handleSelectProject(remaining[0].id);
      } else {
        setCurrentProjectId(null);
        clearProjectData();
      }
    } catch (e) {
      showError(e);
    }
  };

  // --- Sections ---
  const handleCreateSection = async (name: string) => {
    if (!currentProject) return;
    try {
      const section = await workspaceRepository.createSection(currentProject.id, name);
      setSections((prev) => [...prev, section]);
    } catch (e) {
      showError(e);
    }
  };

  const handleRenameSection = async (sectionId: string, newName: string) => {
    try {
      const updated = await workspaceRepository.updateSection(sectionId, { name: newName });
      setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      showError(e);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      // セクション内のメモはサーバー側でまとめて削除される
      await workspaceRepository.deleteSection(sectionId);
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
      removeNotesLocally(notes.filter((n) => n.sectionId === sectionId).map((n) => n.id));
    } catch (e) {
      showError(e);
    }
  };

  // --- PRD ---
  const upsertPrd = (prd: PrdDocument) =>
    setPrds((prev) => [prd, ...prev.filter((p) => p.id !== prd.id)]);

  const handleGeneratePrd = async (params: PrdGenerateParams) => {
    if (!currentProject) return;

    const sourceNotes = notes.filter((n) => params.selectedNoteIds.includes(n.id));
    const existingPrd = params.targetPrdId ? prds.find((p) => p.id === params.targetPrdId) : undefined;

    // 本文以外（タイトル・名前・既存PRD）は文脈として渡すだけなので、上限を超える分は切り詰める
    const clipTitle = (text: string | undefined) => text?.slice(0, AI_INPUT_LIMITS.MAX_TITLE_CHARS);
    const data = await generatePrd({
      projectName: clipTitle(currentProject.name) ?? '',
      mode: params.mode,
      detailLevel: params.detailLevel,
      notes: sourceNotes.map((n) => ({
        id: n.id,
        title: clipTitle(n.title) ?? '',
        content: n.content,
        sectionName: clipTitle(sections.find((s) => s.id === n.sectionId)?.name),
      })),
      existingPrd: existingPrd?.content.slice(0, AI_INPUT_LIMITS.MAX_EXISTING_PRD_CHARS),
    });

    const title =
      existingPrd?.title || `${currentProject.name} 仕様書 (${getPrdModeMeta(params.mode).titleLabel}版)`;
    const input: PrdInput = {
      title: clipTitle(title) ?? '',
      content: data.markdown,
      generationMode: params.mode,
      detailLevel: params.detailLevel,
      sourceNoteIds: data.sourceNoteIds,
      facts: data.facts,
      proposals: data.proposals,
      openQuestions: data.openQuestions,
      contradictions: data.contradictions,
    };

    const savedPrd = existingPrd
      ? await workspaceRepository.savePrdVersion(existingPrd.id, input)
      : await workspaceRepository.createPrd(currentProject.id, input);

    upsertPrd(savedPrd);
    setPrdFallback(data.usedFallback ? { prdId: savedPrd.id, reason: data.fallbackReason ?? 'ai_error' } : null);
    setActivePrdId(savedPrd.id);
  };

  const closePrdViewer = () => {
    setActivePrdId(null);
    setPrdFallback(null);
  };

  const handleUpdatePrd = async (prdId: string, updates: Partial<PrdDocument>) => {
    const existing = prds.find((p) => p.id === prdId);
    if (!existing) return;
    try {
      upsertPrd(await workspaceRepository.savePrdVersion(prdId, toPrdInput({ ...existing, ...updates })));
    } catch (e) {
      showError(e);
    }
  };

  const handleDeletePrd = async (prdId: string) => {
    try {
      await workspaceRepository.deletePrd(prdId);
      setPrds((prev) => prev.filter((p) => p.id !== prdId));
      if (activePrdId === prdId) setActivePrdId(null);
    } catch (e) {
      showError(e);
    }
  };

  const openPrdGenerator = (targetPrdId: string | null) => {
    // ビューアの上に重ねると操作できないため閉じる（生成後に結果のビューアを開く）
    closePrdViewer();
    setGeneratorTargetPrdId(targetPrdId);
    setIsPrdGeneratorOpen(true);
  };

  const closePrdGenerator = () => {
    setIsPrdGeneratorOpen(false);
    setGeneratorTargetPrdId(null);
  };

  // --- Rough note structuring ---
  const handleStructureNote = (noteId: string) => {
    const foundPane = panes.find((p) => p.noteId === noteId);
    if (foundPane) setActivePaneId(foundPane.id);
    setIsStructureModalOpen(true);
  };

  const handleApplyStructuredNote = (noteId: string, newTitle: string, newContent: string) => {
    handleUpdateNote(noteId, { title: newTitle, content: newContent });
    setNoteRevisions((prev) => ({ ...prev, [noteId]: (prev[noteId] ?? 0) + 1 }));
  };

  const handleSaveStructuredAsNew = async (sectionId: string, title: string, content: string) => {
    if (!currentProject) return;
    const targetSectionId = sectionId || sections[0]?.id;
    if (!targetSectionId) return;
    try {
      const newNote = await workspaceRepository.createNote(currentProject.id, targetSectionId, title, content);
      addNote(newNote);
      handleOpenNoteInActivePane(newNote.id);
    } catch (e) {
      showError(e);
    }
  };

  // --- 旧 localStorage データの取り込み ---
  const handleImportLegacy = async () => {
    let lastError: unknown = null;
    for (const legacy of legacyProjects) {
      try {
        await workspaceRepository.importLegacyProject(legacy.payload);
        removeLegacyProject(legacy.id);
      } catch (e) {
        lastError = e;
      }
    }
    await loadWorkspace(currentProject?.id);
    setLegacyProjects(findLegacyProjects());
    if (lastError) throw lastError;
  };

  const handleDiscardLegacy = () => {
    clearLegacyData();
    setLegacyProjects([]);
  };

  // Cmd/Ctrl + N でクイックメモ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === QUICK_CAPTURE_SHORTCUT_KEY) {
        e.preventDefault();
        handleFastCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panes, activePaneId, sections, currentProject]);

  if (loadState !== 'ready') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400">
        {loadState === 'loading' ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
            <span>ワークスペースを読み込んでいます…</span>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm">ワークスペースを読み込めませんでした。</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500"
            >
              再読み込み
            </button>
          </div>
        )}
      </div>
    );
  }

  const activePane = panes.find((p) => p.id === activePaneId);
  const activeNoteId = activePane?.noteId || notes[0]?.id || null;
  const activePrd = prds.find((p) => p.id === activePrdId) || null;
  const projectName = currentProject?.name || FALLBACK_PROJECT_NAME;

  const errorBanner = errorMessage && (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-lg w-[calc(100%-2rem)] px-4 py-2.5 rounded-xl shadow-lg bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1">{errorMessage}</span>
      <button type="button" onClick={() => setErrorMessage(null)} className="shrink-0" aria-label="閉じる">
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  const legacyDialog = legacyProjects.length > 0 && (
    <LegacyImportDialog
      projects={legacyProjects}
      onImport={handleImportLegacy}
      onDiscard={handleDiscardLegacy}
      onLater={() => setLegacyProjects([])}
    />
  );

  if (!currentProject) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-100/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold">{APP_NAME} にプロジェクトがありません</p>
          <button
            type="button"
            onClick={handleCreateProject}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500"
          >
            <FolderPlus className="w-4 h-4" />
            <span>プロジェクトを作成</span>
          </button>
        </div>
        {errorBanner}
        {legacyDialog}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-100/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      <Header
        currentProject={currentProject}
        projects={projects}
        paneCount={paneCount}
        saveStatus={saveStatus}
        selectedNotesCount={notes.length}
        sidebarOpen={sidebarOpen}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onChangePaneCount={handleChangePaneCount}
        onOpenStructureRoughNote={() => setIsStructureModalOpen(true)}
        onOpenPrdGenerator={() => openPrdGenerator(null)}
        onRetrySave={() => saveQueue.retryAll()}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          sections={sections}
          notes={notes}
          prds={prds}
          panes={panes.slice(0, paneCount)}
          activePaneId={activePaneId}
          isOpen={sidebarOpen}
          onSelectNote={handleOpenNoteInActivePane}
          onCreateNote={handleFastCapture}
          onDeleteNote={handleDeleteNote}
          onDuplicateNote={handleDuplicateNote}
          onMoveNote={handleMoveNote}
          onCreateSection={handleCreateSection}
          onRenameSection={handleRenameSection}
          onDeleteSection={handleDeleteSection}
          onOpenPrd={setActivePrdId}
        />

        <Workspace
          paneCount={paneCount}
          panes={panes}
          notes={notes}
          sections={sections}
          noteRevisions={noteRevisions}
          activePaneId={activePaneId}
          onActivatePane={handleActivatePane}
          onSelectNoteInPane={handleSelectNoteInPane}
          onCreateNoteInPane={handleCreateNoteInPane}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onMoveNote={handleMoveNote}
          onStructureNote={handleStructureNote}
        />
      </div>

      <StructureRoughNoteModal
        isOpen={isStructureModalOpen}
        notes={notes}
        sections={sections}
        activeNoteId={activeNoteId}
        projectName={projectName}
        onClose={() => setIsStructureModalOpen(false)}
        onApplyToNote={handleApplyStructuredNote}
        onSaveAsNewNote={handleSaveStructuredAsNew}
      />

      <PrdGeneratorModal
        isOpen={isPrdGeneratorOpen}
        notes={notes}
        sections={sections}
        existingPrds={prds}
        projectName={projectName}
        defaultTargetPrdId={generatorTargetPrdId}
        onClose={closePrdGenerator}
        onGenerate={handleGeneratePrd}
      />

      {activePrd && (
        <PrdViewerModal
          prd={activePrd}
          notes={notes}
          fallbackReason={prdFallback?.prdId === activePrd.id ? prdFallback.reason : undefined}
          onClose={closePrdViewer}
          onUpdatePrd={handleUpdatePrd}
          onDeletePrd={handleDeletePrd}
          onRegenerate={openPrdGenerator}
          onOpenNoteInPane={handleOpenNoteInActivePane}
        />
      )}

      {errorBanner}
      {legacyDialog}
    </div>
  );
}
