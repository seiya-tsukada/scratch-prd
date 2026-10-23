import { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { PrdGeneratorModal, PrdGenerateParams } from './components/PrdGeneratorModal';
import { StructureRoughNoteModal } from './components/StructureRoughNoteModal';
import { PrdViewerModal } from './components/PrdViewerModal';
import { SupabaseGuideModal } from './components/SupabaseGuideModal';
import { workspaceRepository } from './services/workspaceRepository';
import { generatePrd } from './services/apiClient';
import {
  DEFAULT_ACTIVE_PANE_ID,
  DEFAULT_PANE_COUNT,
  FALLBACK_PROJECT_NAME,
  FALLBACK_SECTION_ID,
  INBOX_SECTION_KEYWORD,
  QUICK_CAPTURE_SHORTCUT_KEY,
  TIMING,
  UNTITLED_SHORT_LABEL,
  createEmptyPanes,
} from './config/app';
import { ID_PREFIX } from './config/storage';
import { INITIAL_PROJECT_ID } from './config/seed';
import { getPrdModeMeta } from './config/prd';
import { Project, Section, Note, PrdDocument, PaneCount, PaneInfo, SaveStatus } from './types';

export default function App() {
  // Projects
  const [projects, setProjects] = useState<Project[]>(() => workspaceRepository.getProjects());
  const [currentProjectId, setCurrentProjectId] = useState<string>(
    () => workspaceRepository.getProjects()[0]?.id || INITIAL_PROJECT_ID
  );
  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  // Active project data
  const [sections, setSections] = useState<Section[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [prds, setPrds] = useState<PrdDocument[]>([]);

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
  const [isSupabaseGuideOpen, setIsSupabaseGuideOpen] = useState(false);

  const refreshNotes = (projectId: string) => {
    const updated = workspaceRepository.getNotes(projectId);
    setNotes(updated);
    return updated;
  };
  const refreshSections = (projectId: string) => setSections(workspaceRepository.getSections(projectId));
  const refreshPrds = (projectId: string) => setPrds(workspaceRepository.getPrdDocuments(projectId));

  const loadProjectData = useCallback((projId: string) => {
    const pNotes = workspaceRepository.getNotes(projId);
    const prefs = workspaceRepository.getPreferences(projId);

    setSections(workspaceRepository.getSections(projId));
    setNotes(pNotes);
    setPrds(workspaceRepository.getPrdDocuments(projId));
    setPaneCount(prefs.paneCount);

    // 存在しないメモを指すペインには先頭から順にメモを割り当てる
    const validPanes = prefs.panes.map((pane, idx) =>
      pNotes.some((n) => n.id === pane.noteId) ? pane : { ...pane, noteId: pNotes[idx]?.id || null }
    );

    setPanes(validPanes);
    setActivePaneId(prefs.activePaneId || validPanes[0].id);
  }, []);

  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject?.id, loadProjectData]);

  // ペイン構成の保存（デバウンス）
  const savePrefsTimer = useRef<NodeJS.Timeout | null>(null);
  const savePreferences = useCallback(
    (newCount: PaneCount, newPanes: PaneInfo[], newActivePaneId: string) => {
      if (!currentProject) return;
      if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
      savePrefsTimer.current = setTimeout(() => {
        workspaceRepository.savePreferences({
          id: ID_PREFIX.PREFERENCES + currentProject.id,
          userId: currentProject.userId,
          projectId: currentProject.id,
          paneCount: newCount,
          panes: newPanes,
          activePaneId: newActivePaneId,
          updatedAt: new Date().toISOString(),
        });
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
  const handleCreateNoteInPane = (paneIndex: number, sectionId?: string) => {
    if (!currentProject) return;
    setSaveStatus('saving');

    const targetSectionId =
      sectionId ||
      sections.find((s) => s.name.toLowerCase().includes(INBOX_SECTION_KEYWORD))?.id ||
      sections[0]?.id ||
      FALLBACK_SECTION_ID;

    const newNote = workspaceRepository.createNote(currentProject.id, targetSectionId, '', '');
    refreshNotes(currentProject.id);

    setPanes((prev) => {
      const next = [...prev];
      next[paneIndex] = { ...next[paneIndex], noteId: newNote.id };
      savePreferences(paneCount, next, next[paneIndex].id);
      return next;
    });

    setActivePaneId(panes[paneIndex].id);
    setSaveStatus('saved');
  };

  /** サイドバー / ショートカットからの即時メモ作成 */
  const handleFastCapture = (sectionId?: string) => {
    handleCreateNoteInPane(getActivePaneIndex(), sectionId);
  };

  const handleUpdateNote = (noteId: string, updates: Partial<Note>) => {
    setSaveStatus('saving');
    try {
      workspaceRepository.updateNote(noteId, updates);
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n))
      );
      setSaveStatus('saved');
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
  };

  const handleDeleteNote = (noteId: string) => {
    if (!currentProject) return;
    workspaceRepository.deleteNote(noteId);
    const updatedNotes = refreshNotes(currentProject.id);

    // 削除したメモを開いていたペインは先頭のメモに切り替える
    const replacementId = updatedNotes[0]?.id ?? null;
    setPanes((prev) => prev.map((p) => (p.noteId === noteId ? { ...p, noteId: replacementId } : p)));
  };

  const handleDuplicateNote = (noteId: string) => {
    if (!currentProject) return;
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const dup = workspaceRepository.createNote(
      currentProject.id,
      target.sectionId,
      `${target.title || UNTITLED_SHORT_LABEL} (コピー)`,
      target.content
    );
    refreshNotes(currentProject.id);
    handleOpenNoteInActivePane(dup.id);
  };

  const handleMoveNote = (noteId: string, targetSectionId: string) => {
    if (!currentProject) return;
    workspaceRepository.moveNote(noteId, targetSectionId);
    refreshNotes(currentProject.id);
  };

  // --- Projects ---
  const handleCreateProject = () => {
    const name = window.prompt('新しいプロジェクト名を入力してください:');
    if (!name || !name.trim()) return;
    const newProj = workspaceRepository.createProject(name.trim());
    setProjects(workspaceRepository.getProjects());
    setCurrentProjectId(newProj.id);
  };

  const handleRenameProject = (newName: string) => {
    if (!currentProject) return;
    workspaceRepository.updateProject(currentProject.id, { name: newName });
    setProjects(workspaceRepository.getProjects());
  };

  const handleDeleteProject = (projectId: string) => {
    workspaceRepository.deleteProject(projectId);
    const remaining = workspaceRepository.getProjects();
    setProjects(remaining);
    if (remaining.length > 0) {
      setCurrentProjectId(remaining[0].id);
    }
  };

  // --- Sections ---
  const handleCreateSection = (name: string) => {
    if (!currentProject) return;
    workspaceRepository.createSection(currentProject.id, name);
    refreshSections(currentProject.id);
  };

  const handleRenameSection = (sectionId: string, newName: string) => {
    workspaceRepository.updateSection(sectionId, { name: newName });
    refreshSections(currentProject.id);
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!currentProject) return;
    // セクション内のメモも削除する
    notes
      .filter((n) => n.sectionId === sectionId)
      .forEach((n) => workspaceRepository.deleteNote(n.id));
    workspaceRepository.deleteSection(sectionId);

    refreshSections(currentProject.id);
    refreshNotes(currentProject.id);
  };

  // --- PRD ---
  const handleGeneratePrd = async (params: PrdGenerateParams) => {
    if (!currentProject) return;

    const sourceNotes = notes.filter((n) => params.selectedNoteIds.includes(n.id));
    const existingPrd = params.targetPrdId
      ? prds.find((p) => p.id === params.targetPrdId)
      : undefined;

    const data = await generatePrd({
      projectName: currentProject.name,
      mode: params.mode,
      detailLevel: params.detailLevel,
      notes: sourceNotes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        sectionName: sections.find((s) => s.id === n.sectionId)?.name,
      })),
      existingPrd: existingPrd?.content,
    });

    const title =
      existingPrd?.title ||
      `${currentProject.name} 仕様書 (${getPrdModeMeta(params.mode).titleLabel}版)`;

    const savedPrd = workspaceRepository.savePrdDocument({
      id: params.targetPrdId,
      projectId: currentProject.id,
      userId: currentProject.userId,
      title,
      content: data.markdown,
      generationMode: params.mode,
      detailLevel: params.detailLevel,
      sourceNoteIds: data.sourceNoteIds,
      facts: data.facts,
      proposals: data.proposals,
      openQuestions: data.openQuestions,
      contradictions: data.contradictions,
      version: existingPrd ? (existingPrd.version || 1) + 1 : 1,
    });

    refreshPrds(currentProject.id);
    setActivePrdId(savedPrd.id);
  };

  const handleUpdatePrd = (prdId: string, updates: Partial<PrdDocument>) => {
    if (!currentProject) return;
    const existing = prds.find((p) => p.id === prdId);
    if (!existing) return;
    workspaceRepository.savePrdDocument({ ...existing, ...updates, id: prdId });
    refreshPrds(currentProject.id);
  };

  const handleDeletePrd = (prdId: string) => {
    if (!currentProject) return;
    workspaceRepository.deletePrdDocument(prdId);
    refreshPrds(currentProject.id);
    if (activePrdId === prdId) setActivePrdId(null);
  };

  const openPrdGenerator = (targetPrdId: string | null) => {
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
  };

  const handleSaveStructuredAsNew = (sectionId: string, title: string, content: string) => {
    if (!currentProject) return;
    const newNote = workspaceRepository.createNote(
      currentProject.id,
      sectionId || sections[0]?.id || FALLBACK_SECTION_ID,
      title,
      content
    );
    refreshNotes(currentProject.id);
    handleOpenNoteInActivePane(newNote.id);
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
  }, [panes, activePaneId]);

  const activePane = panes.find((p) => p.id === activePaneId);
  const activeNoteId = activePane?.noteId || notes[0]?.id || null;
  const activePrd = prds.find((p) => p.id === activePrdId) || null;
  const projectName = currentProject?.name || FALLBACK_PROJECT_NAME;
  const openSupabaseGuide = () => setIsSupabaseGuideOpen(true);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-100/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      <Header
        currentProject={currentProject}
        projects={projects}
        paneCount={paneCount}
        saveStatus={saveStatus}
        selectedNotesCount={notes.length}
        sidebarOpen={sidebarOpen}
        onSelectProject={setCurrentProjectId}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onChangePaneCount={handleChangePaneCount}
        onOpenStructureRoughNote={() => setIsStructureModalOpen(true)}
        onOpenPrdGenerator={() => openPrdGenerator(null)}
        onOpenSupabaseGuide={openSupabaseGuide}
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
          onOpenSupabaseGuide={openSupabaseGuide}
        />

        <Workspace
          paneCount={paneCount}
          panes={panes}
          notes={notes}
          sections={sections}
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
          onClose={() => setActivePrdId(null)}
          onUpdatePrd={handleUpdatePrd}
          onDeletePrd={handleDeletePrd}
          onRegenerate={openPrdGenerator}
          onOpenNoteInPane={handleOpenNoteInActivePane}
        />
      )}

      <SupabaseGuideModal isOpen={isSupabaseGuideOpen} onClose={() => setIsSupabaseGuideOpen(false)} />
    </div>
  );
}
