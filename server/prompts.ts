import type { GeneratePrdRequest, StructureRoughNoteRequest } from '../src/config/api';
import type { PrdDetailLevel, PrdGenerationMode } from '../src/types';
import { DEFAULT_DETAIL_LEVEL, DEFAULT_GENERATION_MODE } from '../src/config/prd';
import { DEFAULT_PROJECT_NAME, EXISTING_PRD_CONTEXT_MAX_CHARS } from './config';

/** 生成モードごとの AI への指示 */
const MODE_INSTRUCTIONS: Record<PrdGenerationMode, string> = {
  strict: `【Mode A: 厳密 (Strict)】
- 元のメモに記載された情報のみを使用。推測・追加なし。不足は「未定」「要確認」と明記。proposals配列は空にすること。`,
  suggest: `【Mode B: 整理＆提案 (Suggest) - 推奨】
- 原文を整理し、不足部分に提案ラベルをつけてproposalsに含めること。`,
  expand: `【Mode C: 仮説拡張 (Expand)】
- 機能案、KPI候補、リスク、検証方法まで仮説として積極的にproposalsへ拡張すること。`,
};

/** 詳細度ごとの AI への指示 */
const DETAIL_INSTRUCTIONS: Record<PrdDetailLevel, string> = {
  brief: '要点を絞ったコンパクトなPRD',
  standard: '実践的で明確な標準PRD',
  detailed: '詳細な開発仕様PRD',
};

/** 殴り書きメモを PRD 風 Markdown に整形するプロンプト */
export function buildStructureRoughNotePrompt({ title, content, projectName }: StructureRoughNoteRequest): string {
  return `You are a product manager specializing in transforming rough, messy scribbles into clean PRD-style markdown notes.

Project: ${projectName || DEFAULT_PROJECT_NAME}
Raw scribble title: ${title || '(無題)'}
Raw scribble content:
"""
${content}
"""

Instructions:
1. Restructure this rough memo into a clean, concise, PRD-like Markdown document in Japanese.
2. Structure format:
# [Clear Short Title]
## 1. 概要 (Overview)
- Concise 1-2 sentence summary.
## 2. 課題とユーザー (Problem & Users)
- Bullet points of user pain points and target.
## 3. 主要要件 (Key Requirements)
- [ ] Bullet list of concrete, testable requirements (using checklist format - [ ]).
## 4. 実装・UIアイデア (Implementation Notes)
- Key technical, interaction, or architectural notes.
## 5. 未決事項 (Open Questions)
- Bullet points of things needing user confirmation.

Do not invent unnecessary complex requirements; extract and sharpen the user's rough thoughts into actionable specifications.
Output strictly valid JSON with this format:
{
  "structuredTitle": "Clear Short Title",
  "structuredContent": "Complete formatted Markdown string"
}`;
}

/** 複数メモから PRD を生成するプロンプト */
export function buildGeneratePrdPrompt({
  projectName,
  mode,
  detailLevel,
  notes,
  existingPrd,
}: GeneratePrdRequest): string {
  const notesContent = notes
    .map(
      (n, index) =>
        `[Note #${index + 1}] ID: ${n.id} | Section: ${n.sectionName || 'General'} | Title: ${n.title || '(無題)'}\nContent:\n${n.content}\n`
    )
    .join('\n---\n');

  const modeInstructions = MODE_INSTRUCTIONS[mode || DEFAULT_GENERATION_MODE];
  const detailInstructions = DETAIL_INSTRUCTIONS[detailLevel || DEFAULT_DETAIL_LEVEL];

  const systemPrompt = `You are a senior product manager. Transform fragmented user notes into a clear, concise, actionable Product Requirements Document (PRD) in Japanese.
Rules:
1. Treat user notes as primary truth. Never invent business facts or budgets.
2. Distinguish confirmed facts, AI proposals, and open questions.
3. Be high-density, crisp, and direct. Avoid unnecessary fluff to maximize generation speed.

Project: ${projectName}
Mode: ${modeInstructions}
Detail: ${detailInstructions}
${existingPrd ? `Previous PRD Reference:\n${existingPrd.slice(0, EXISTING_PRD_CONTEXT_MAX_CHARS)}` : ''}`;

  const userPrompt = `Source notes:
${notesContent}

Output strictly valid JSON with this shape:
{
  "markdown": "Complete Markdown PRD in Japanese",
  "facts": [
    { "id": "fact-1", "text": "fact summary", "sourceNoteId": "note-id", "sourceNoteTitle": "note title" }
  ],
  "proposals": [
    { "id": "prop-1", "category": "category", "title": "proposal title", "description": "detail", "impact": "high|medium|low" }
  ],
  "openQuestions": [
    { "id": "oq-1", "question": "question", "context": "context", "urgency": "critical|normal" }
  ],
  "contradictions": []
}`;

  return `${systemPrompt}\n\n${userPrompt}`;
}
