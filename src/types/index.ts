export type PrdGenerationMode = 'strict' | 'suggest' | 'expand';
export type PrdDetailLevel = 'brief' | 'standard' | 'detailed';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  position: number;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  sectionId: string;
  projectId: string;
  userId: string;
  title: string;
  content: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrdFact {
  id: string;
  text: string;
  sourceNoteId?: string;
  sourceNoteTitle?: string;
}

export interface PrdProposal {
  id: string;
  category: string;
  title: string;
  description: string;
  impact?: 'high' | 'medium' | 'low';
}

export interface PrdOpenQuestion {
  id: string;
  question: string;
  context: string;
  urgency: 'critical' | 'normal';
}

export interface PrdContradiction {
  id: string;
  issue: string;
  notesInvolved: string[];
}

export interface PrdVersion {
  id: string;
  prdDocumentId: string;
  versionNumber: number;
  title: string;
  content: string;
  generationMode: PrdGenerationMode;
  detailLevel: PrdDetailLevel;
  sourceNoteIds: string[];
  facts: PrdFact[];
  proposals: PrdProposal[];
  openQuestions: PrdOpenQuestion[];
  contradictions: PrdContradiction[];
  createdAt: string;
  summary?: string;
}

export interface PrdDocument {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  content: string;
  generationMode: PrdGenerationMode;
  detailLevel: PrdDetailLevel;
  sourceNoteIds: string[];
  facts: PrdFact[];
  proposals: PrdProposal[];
  openQuestions: PrdOpenQuestion[];
  contradictions: PrdContradiction[];
  version: number;
  versions?: PrdVersion[];
  createdAt: string;
  updatedAt: string;
}

export type PaneCount = 1 | 2 | 3 | 4;

export interface PaneInfo {
  id: string;
  noteId: string | null;
}

export interface WorkspacePreferences {
  id: string;
  userId: string;
  projectId: string;
  paneCount: PaneCount;
  panes: PaneInfo[];
  activePaneId: string;
  updatedAt: string;
}

export type SaveStatus = 'saved' | 'saving' | 'error';
