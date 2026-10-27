import React from 'react';
import { PaneCount, PaneInfo, Note, Section } from '../types';
import { NotePane } from './NotePane';

interface WorkspaceProps {
  paneCount: PaneCount;
  panes: PaneInfo[];
  notes: Note[];
  sections: Section[];
  /** メモ ID ごとの読み直し回数（NotePane の syncKey） */
  noteRevisions: Record<string, number>;
  activePaneId: string;
  onActivatePane: (paneId: string) => void;
  onSelectNoteInPane: (paneIndex: number, noteId: string) => void;
  onCreateNoteInPane: (paneIndex: number) => void;
  onUpdateNote: (noteId: string, updates: Partial<Note>) => void;
  onDeleteNote: (noteId: string) => void;
  onMoveNote: (noteId: string, targetSectionId: string) => void;
  onStructureNote?: (noteId: string) => void;
}

/** ペイン数ごとのグリッドレイアウト */
const GRID_CLASSES: Record<PaneCount, string> = {
  1: 'grid-cols-1 grid-rows-1',
  2: 'grid-cols-1 md:grid-cols-2 grid-rows-1',
  3: 'grid-cols-1 md:grid-cols-3 grid-rows-1',
  4: 'grid-cols-1 md:grid-cols-2 grid-rows-2',
};
const DEFAULT_GRID_CLASS = 'grid-cols-1 md:grid-cols-2';

export const Workspace: React.FC<WorkspaceProps> = ({
  paneCount,
  panes,
  notes,
  sections,
  noteRevisions,
  activePaneId,
  onActivatePane,
  onSelectNoteInPane,
  onCreateNoteInPane,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  onStructureNote,
}) => {
  const activePanes = panes.slice(0, paneCount);
  const gridClass = GRID_CLASSES[paneCount] ?? DEFAULT_GRID_CLASS;

  return (
    <main className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] p-2.5 sm:p-3 overflow-hidden bg-zinc-100/60 dark:bg-zinc-950/40">
      <div className={`w-full h-full grid gap-2.5 sm:gap-3 ${gridClass}`}>
        {activePanes.map((pane, index) => (
          <div key={pane.id} className="min-h-0 min-w-0 h-full">
            <NotePane
              paneIndex={index}
              note={notes.find((n) => n.id === pane.noteId) || null}
              syncKey={pane.noteId ? noteRevisions[pane.noteId] : undefined}
              allNotes={notes}
              sections={sections}
              isActive={activePaneId === pane.id}
              onActivate={() => onActivatePane(pane.id)}
              onSelectNote={(noteId) => onSelectNoteInPane(index, noteId)}
              onCreateNoteInPane={() => onCreateNoteInPane(index)}
              onUpdateNote={onUpdateNote}
              onDeleteNote={onDeleteNote}
              onMoveNote={onMoveNote}
              onStructureNote={onStructureNote}
            />
          </div>
        ))}
      </div>
    </main>
  );
};
