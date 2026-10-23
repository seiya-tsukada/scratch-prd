/**
 * クライアントとサーバーで共有する API 定義。
 * サーバー側 (server.ts) からも import されるため、ブラウザ専用 API に依存しないこと。
 */
import type {
  PrdContradiction,
  PrdDetailLevel,
  PrdFact,
  PrdGenerationMode,
  PrdOpenQuestion,
  PrdProposal,
} from '../types';

export const API_ENDPOINTS = {
  GENERATE_PRD: '/api/generate-prd',
  STRUCTURE_ROUGH_NOTE: '/api/structure-rough-note',
  HEALTH: '/api/health',
} as const;

export interface PrdNoteInput {
  id: string;
  title: string;
  content: string;
  sectionName?: string;
}

export interface GeneratePrdRequest {
  projectName: string;
  mode: PrdGenerationMode;
  detailLevel: PrdDetailLevel;
  notes: PrdNoteInput[];
  existingPrd?: string;
}

export interface GeneratePrdResponse {
  markdown: string;
  facts: PrdFact[];
  proposals: PrdProposal[];
  openQuestions: PrdOpenQuestion[];
  contradictions: PrdContradiction[];
  sourceNoteIds: string[];
  _fallbackNotice?: string;
}

export interface StructureRoughNoteRequest {
  title?: string;
  content: string;
  projectName?: string;
}

export interface StructureRoughNoteResponse {
  structuredTitle: string;
  structuredContent: string;
}
