/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Workspace } from './components/Workspace';
import { PrdGeneratorModal } from './components/PrdGeneratorModal';
import { StructureRoughNoteModal } from './components/StructureRoughNoteModal';
import { PrdViewerModal } from './components/PrdViewerModal';
import { SupabaseGuideModal } from './components/SupabaseGuideModal';
import { workspaceRepository } from './services/workspaceRepository';
import {
  Project,
  Section,
  Note,
  PrdDocument,
  PaneCount,
  PaneInfo,
  SaveStatus,
  PrdGenerationMode,
  PrdDetailLevel,
} from './types';

export default function App() {
  // Projects State
  const [projects, setProjects] = useState<Project[]>(() => workspaceRepository.getProjects());
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => {
    const list = workspaceRepository.getProjects();
    return list[0]?.id || 'proj-idea-workspace';
  });

  const currentProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  // Sections & Notes & PRDs for active project
  const [sections, setSections] = useState<Section[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [prds, setPrds] = useState<PrdDocument[]>([]);

  // Workspace Pane Preferences
  const [paneCount, setPaneCount] = useState<PaneCount>(2);
  const [panes, setPanes] = useState<PaneInfo[]>([
    { id: 'pane-0', noteId: null },
    { id: 'pane-1', noteId: null },
    { id: 'pane-2', noteId: null },
    { id: 'pane-3', noteId: null },
  ]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-0');

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isPrdGeneratorOpen, setIsPrdGeneratorOpen] = useState(false);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [generatorTargetPrdId, setGeneratorTargetPrdId] = useState<string | null>(null);
  const [activePrdId, setActivePrdId] = useState<string | null>(null);
  const [isSupabaseGuideOpen, setIsSupabaseGuideOpen] = useState(false);

  // Load project data when currentProjectId changes
  const loadProjectData = useCallback((projId: string) => {
    const pSections = workspaceRepository.getSections(projId);
    const pNotes = workspaceRepository.getNotes(projId);
    const pPrds = workspaceRepository.getPrdDocuments(projId);
    const prefs = workspaceRepository.getPreferences(projId);

    setSections(pSections);
    setNotes(pNotes);
    setPrds(pPrds);
    setPaneCount(prefs.paneCount);

    // Ensure pane noteIds point to existing notes, or assign first available notes
    const validPanes = prefs.panes.map((pane, idx) => {
      const exists = pNotes.some((n) => n.id === pane.noteId);
      if (exists) return pane;
      return {
        ...pane,
        noteId: pNotes[idx]?.id || null,
      };
    });

    setPanes(validPanes);
    setActivePaneId(prefs.activePaneId || validPanes[0].id);
  }, []);

  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject?.id, loadProjectData]);

  // Save workspace preferences whenever panes or paneCount changes
  const savePrefsTimer = useRef<NodeJS.Timeout | null>(null);
  const savePreferences = useCallback(
    (newCount: PaneCount, newPanes: PaneInfo[], newActivePaneId: string) => {
      if (!currentProject) return;
      if (savePrefsTimer.current) clearTimeout(savePrefsTimer.current);
      savePrefsTimer.current = setTimeout(() => {
        workspaceRepository.savePreferences({
          id: 'prefs-' + currentProject.id,
          userId: currentProject.userId,
          projectId: currentProject.id,
          paneCount: newCount,
          panes: newPanes,
          activePaneId: newActivePaneId,
          updatedAt: new Date().toISOString(),
        });
      }, 400);
    },
    [currentProject]
  );

  // Handle Pane Count Change
  const handleChangePaneCount = (count: PaneCount) => {
    setPaneCount(count);
    savePreferences(count, panes, activePaneId);
  };

  // Handle Note Selection in specific Pane
  const handleSelectNoteInPane = (paneIndex: number, noteId: string) => {
    setPanes((prev) => {
      const next = [...prev];
      next[paneIndex] = { ...next[paneIndex], noteId };
      savePreferences(paneCount, next, activePaneId);
      return next;
    });
  };

  // Handle Note click in Sidebar (opens in the currently active pane)
  const handleSelectNoteFromSidebar = (noteId: string) => {
    const activeIndex = panes.findIndex((p) => p.id === activePaneId);
    const targetIndex = activeIndex !== -1 ? activeIndex : 0;
    handleSelectNoteInPane(targetIndex, noteId);
  };

  // Create Note in a given pane
  const handleCreateNoteInPane = (paneIndex: number, sectionId?: string) => {
    if (!currentProject) return;
    setSaveStatus('saving');

    const targetSectionId =
      sectionId ||
      sections.find((s) => s.name.toLowerCase().includes('inbox'))?.id ||
      sections[0]?.id ||
      'sec-default';

    const newNote = workspaceRepository.createNote(
      currentProject.id,
      targetSectionId,
      '',
      ''
    );

    const updatedNotes = workspaceRepository.getNotes(currentProject.id);
    setNotes(updatedNotes);

    setPanes((prev) => {
      const next = [...prev];
      next[paneIndex] = { ...next[paneIndex], noteId: newNote.id };
      savePreferences(paneCount, next, next[paneIndex].id);
      return next;
    });

    setActivePaneId(panes[paneIndex].id);
    setSaveStatus('saved');
  };

  // Fast capture from sidebar / keyboard
  const handleFastCapture = (sectionId?: string) => {
    const activeIndex = panes.findIndex((p) => p.id === activePaneId);
    const targetIndex = activeIndex !== -1 ? activeIndex : 0;
    handleCreateNoteInPane(targetIndex, sectionId);
  };

  // Update Note
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

  // Delete Note
  const handleDeleteNote = (noteId: string) => {
    if (!currentProject) return;
    workspaceRepository.deleteNote(noteId);
    const updatedNotes = workspaceRepository.getNotes(currentProject.id);
    setNotes(updatedNotes);

    // Clear from panes if open
    setPanes((prev) =>
      prev.map((p) =>
        p.noteId === noteId
          ? { ...p, noteId: updatedNotes.length > 0 ? updatedNotes[0].id : null }
          : p
      )
    );
  };

  // Duplicate Note
  const handleDuplicateNote = (noteId: string) => {
    if (!currentProject) return;
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const dup = workspaceRepository.createNote(
      currentProject.id,
      target.sectionId,
      `${target.title || '無題'} (コピー)`,
      target.content
    );
    const updatedNotes = workspaceRepository.getNotes(currentProject.id);
    setNotes(updatedNotes);
    handleSelectNoteFromSidebar(dup.id);
  };

  // Move Note to another section
  const handleMoveNote = (noteId: string, targetSectionId: string) => {
    if (!currentProject) return;
    workspaceRepository.moveNote(noteId, targetSectionId);
    setNotes(workspaceRepository.getNotes(currentProject.id));
  };

  // Project Management
  const handleSelectProject = (projectId: string) => {
    setCurrentProjectId(projectId);
  };

  const handleCreateProject = () => {
    const name = window.prompt('新しいプロジェクト名を入力してください:');
    if (!name || !name.trim()) return;
    const newProj = workspaceRepository.createProject(name.trim());
    const all = workspaceRepository.getProjects();
    setProjects(all);
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

  // Section Management
  const handleCreateSection = (name: string) => {
    if (!currentProject) return;
    workspaceRepository.createSection(currentProject.id, name);
    setSections(workspaceRepository.getSections(currentProject.id));
  };

  const handleRenameSection = (sectionId: string, newName: string) => {
    workspaceRepository.updateSection(sectionId, { name: newName });
    setSections(workspaceRepository.getSections(currentProject.id));
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!currentProject) return;
    // Delete notes in section
    const secNotes = notes.filter((n) => n.sectionId === sectionId);
    secNotes.forEach((n) => workspaceRepository.deleteNote(n.id));
    workspaceRepository.deleteSection(sectionId);

    setSections(workspaceRepository.getSections(currentProject.id));
    setNotes(workspaceRepository.getNotes(currentProject.id));
  };

  // PRD Generation
  const handleGeneratePrd = async (params: {
    selectedNoteIds: string[];
    mode: PrdGenerationMode;
    detailLevel: PrdDetailLevel;
    targetPrdId?: string;
  }) => {
    if (!currentProject) return;

    const sourceNotes = notes.filter((n) => params.selectedNoteIds.includes(n.id));
    const existingPrd = params.targetPrdId
      ? prds.find((p) => p.id === params.targetPrdId)
      : undefined;

    const payload = {
      projectName: currentProject.name,
      mode: params.mode,
      detailLevel: params.detailLevel,
      notes: sourceNotes.map((n) => {
        const sec = sections.find((s) => s.id === n.sectionId);
        return {
          id: n.id,
          title: n.title,
          content: n.content,
          sectionName: sec?.name,
        };
      }),
      existingPrd: existingPrd?.content,
    };

    const response = await fetch('/api/generate-prd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`AI生成サーバーエラー: ${response.statusText}`);
    }

    const data = await response.json();

    const title =
      existingPrd?.title ||
      `${currentProject.name} 仕様書 (${
        params.mode === 'strict' ? '厳密' : params.mode === 'expand' ? '仮説拡張' : '提案'
      }版)`;

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

    const updatedPrds = workspaceRepository.getPrdDocuments(currentProject.id);
    setPrds(updatedPrds);
    setActivePrdId(savedPrd.id);
  };

  // PRD Document Updates / Deletions
  const handleUpdatePrd = (prdId: string, updates: Partial<PrdDocument>) => {
    if (!currentProject) return;
    const existing = prds.find((p) => p.id === prdId);
    if (!existing) return;
    const updated = workspaceRepository.savePrdDocument({
      ...existing,
      ...updates,
      id: prdId,
    });
    setPrds(workspaceRepository.getPrdDocuments(currentProject.id));
  };

  const handleDeletePrd = (prdId: string) => {
    if (!currentProject) return;
    workspaceRepository.deletePrdDocument(prdId);
    setPrds(workspaceRepository.getPrdDocuments(currentProject.id));
    if (activePrdId === prdId) setActivePrdId(null);
  };

  const handleOpenPrd = (prdId: string) => {
    setActivePrdId(prdId);
  };

  const handleRegeneratePrd = (prdId: string) => {
    setGeneratorTargetPrdId(prdId);
    setIsPrdGeneratorOpen(true);
  };

  // Keyboard shortcut listener (Cmd+N for quick note)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleFastCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panes, activePaneId]);

  const activePane = panes.find((p) => p.id === activePaneId);
  const activeNoteId = activePane?.noteId || (notes.length > 0 ? notes[0].id : null);

  const handleApplyStructuredNote = (noteId: string, newTitle: string, newContent: string) => {
    handleUpdateNote(noteId, {
      title: newTitle,
      content: newContent,
    });
  };

  const handleSaveStructuredAsNew = (sectionId: string, title: string, content: string) => {
    if (!currentProject) return;
    const newNote = workspaceRepository.createNote(
      currentProject.id,
      sectionId || sections[0]?.id || 'sec-default',
      title,
      content
    );
    setNotes(workspaceRepository.getNotes(currentProject.id));
    handleSelectNoteFromSidebar(newNote.id);
  };

  const activePrd = prds.find((p) => p.id === activePrdId) || null;

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-100/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* Top Header */}
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
        onOpenPrdGenerator={() => {
          setGeneratorTargetPrdId(null);
          setIsPrdGeneratorOpen(true);
        }}
        onOpenSupabaseGuide={() => setIsSupabaseGuideOpen(true)}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Container: Sidebar + Multi-pane Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          sections={sections}
          notes={notes}
          prds={prds}
          panes={panes.slice(0, paneCount)}
          activePaneId={activePaneId}
          isOpen={sidebarOpen}
          onSelectNote={handleSelectNoteFromSidebar}
          onCreateNote={handleFastCapture}
          onDeleteNote={handleDeleteNote}
          onDuplicateNote={handleDuplicateNote}
          onMoveNote={handleMoveNote}
          onCreateSection={handleCreateSection}
          onRenameSection={handleRenameSection}
          onDeleteSection={handleDeleteSection}
          onOpenPrd={handleOpenPrd}
          onOpenSupabaseGuide={() => setIsSupabaseGuideOpen(true)}
        />

        <Workspace
          paneCount={paneCount}
          panes={panes}
          notes={notes}
          sections={sections}
          activePaneId={activePaneId}
          onActivatePane={(id) => {
            setActivePaneId(id);
            savePreferences(paneCount, panes, id);
          }}
          onSelectNoteInPane={handleSelectNoteInPane}
          onCreateNoteInPane={handleCreateNoteInPane}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onMoveNote={handleMoveNote}
          onStructureNote={(noteId) => {
            const foundPane = panes.find((p) => p.noteId === noteId);
            if (foundPane) setActivePaneId(foundPane.id);
            setIsStructureModalOpen(true);
          }}
        />
      </div>

      {/* Rough Note Structuring Modal (1-Click Fast PRD Formatting) */}
      <StructureRoughNoteModal
        isOpen={isStructureModalOpen}
        notes={notes}
        sections={sections}
        activeNoteId={activeNoteId}
        projectName={currentProject?.name || 'アイデア'}
        onClose={() => setIsStructureModalOpen(false)}
        onApplyToNote={handleApplyStructuredNote}
        onSaveAsNewNote={handleSaveStructuredAsNew}
      />

      {/* PRD Generation Configuration Modal */}
      <PrdGeneratorModal
        isOpen={isPrdGeneratorOpen}
        notes={notes}
        sections={sections}
        existingPrds={prds}
        projectName={currentProject?.name || 'アイデア'}
        defaultTargetPrdId={generatorTargetPrdId}
        onClose={() => {
          setIsPrdGeneratorOpen(false);
          setGeneratorTargetPrdId(null);
        }}
        onGenerate={handleGeneratePrd}
      />

      {/* PRD Viewer & Classification Inspector Modal */}
      {activePrd && (
        <PrdViewerModal
          prd={activePrd}
          notes={notes}
          onClose={() => setActivePrdId(null)}
          onUpdatePrd={handleUpdatePrd}
          onDeletePrd={handleDeletePrd}
          onRegenerate={handleRegeneratePrd}
          onOpenNoteInPane={handleSelectNoteFromSidebar}
        />
      )}

      {/* Supabase Architecture & SQL Guide Modal */}
      <SupabaseGuideModal
        isOpen={isSupabaseGuideOpen}
        onClose={() => setIsSupabaseGuideOpen(false)}
      />
    </div>
  );
}
