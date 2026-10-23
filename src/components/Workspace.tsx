import React from 'react';
import { PaneCount, PaneInfo, Note, Section } from '../types';
import { NotePane } from './NotePane';

interface WorkspaceProps {
  paneCount: PaneCount;
  panes: PaneInfo[];
  notes: Note[];
  sections: Section[];
  activePaneId: string;
  onActivatePane: (paneId: string) => void;
  onSelectNoteInPane: (paneIndex: number, noteId: string) => void;
  onCreateNoteInPane: (paneIndex: number) => void;
  onUpdateNote: (noteId: string, updates: Partial<Note>) => void;
  onDeleteNote: (noteId: string) => void;
  onMoveNote: (noteId: string, targetSectionId: string) => void;
  onStructureNote?: (noteId: string) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  paneCount,
  panes,
  notes,
  sections,
  activePaneId,
  onActivatePane,
  onSelectNoteInPane,
  onCreateNoteInPane,
  onUpdateNote,
  onDeleteNote,
  onMoveNote,
  onStructureNote,
}) => {
  // Determine grid CSS class based on paneCount
  const getGridClasses = () => {
    switch (paneCount) {
      case 1:
        return 'grid-cols-1 grid-rows-1';
      case 2:
        return 'grid-cols-1 md:grid-cols-2 grid-rows-1';
      case 3:
        return 'grid-cols-1 md:grid-cols-3 grid-rows-1';
      case 4:
        return 'grid-cols-1 md:grid-cols-2 grid-rows-2';
      default:
        return 'grid-cols-1 md:grid-cols-2';
    }
  };

  // Slices panes to current active count
  const activePanes = panes.slice(0, paneCount);

  return (
    <main className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] p-2.5 sm:p-3 overflow-hidden bg-zinc-100/60 dark:bg-zinc-950/40">
      <div className={`w-full h-full grid gap-2.5 sm:gap-3 ${getGridClasses()}`}>
        {activePanes.map((pane, index) => {
          const currentNote = notes.find((n) => n.id === pane.noteId) || null;
          const isActive = activePaneId === pane.id;

          return (
            <div key={pane.id} className="min-h-0 min-w-0 h-full">
              <NotePane
                paneIndex={index}
                paneId={pane.id}
                note={currentNote}
                allNotes={notes}
                sections={sections}
                isActive={isActive}
                onActivate={() => onActivatePane(pane.id)}
                onSelectNote={(noteId) => onSelectNoteInPane(index, noteId)}
                onCreateNoteInPane={() => onCreateNoteInPane(index)}
                onUpdateNote={onUpdateNote}
                onDeleteNote={onDeleteNote}
                onMoveNote={onMoveNote}
                onStructureNote={onStructureNote}
              />
            </div>
          );
        })}
      </div>
    </main>
  );
};
