"""AI へのプロンプト（server/prompts.ts からの移植）"""

from __future__ import annotations

from backend.app.config import DEFAULT_PROJECT_NAME, EXISTING_PRD_CONTEXT_MAX_CHARS
from backend.app.models.ai import (
    DEFAULT_DETAIL_LEVEL,
    DEFAULT_GENERATION_MODE,
    GeneratePrdRequest,
    PrdDetailLevel,
    PrdGenerationMode,
    StructureRoughNoteRequest,
)

# 生成モードごとの AI への指示
MODE_INSTRUCTIONS: dict[PrdGenerationMode, str] = {
    "strict": """【Mode A: 厳密 (Strict)】
- 元のメモに記載された情報のみを使用。推測・追加なし。不足は「未定」「要確認」と明記。proposals配列は空にすること。""",
    "suggest": """【Mode B: 整理＆提案 (Suggest) - 推奨】
- 原文を整理し、不足部分に提案ラベルをつけてproposalsに含めること。""",
    "expand": """【Mode C: 仮説拡張 (Expand)】
- 機能案、KPI候補、リスク、検証方法まで仮説として積極的にproposalsへ拡張すること。""",
}

# 詳細度ごとの AI への指示
DETAIL_INSTRUCTIONS: dict[PrdDetailLevel, str] = {
    "brief": "要点を絞ったコンパクトなPRD",
    "standard": "実践的で明確な標準PRD",
    "detailed": "詳細な開発仕様PRD",
}


def build_structure_rough_note_prompt(request: StructureRoughNoteRequest) -> str:
    """殴り書きメモを PRD 風 Markdown に整形するプロンプト"""
    return f'''You are a product manager specializing in transforming rough, messy scribbles into clean PRD-style markdown notes.

Project: {request.project_name or DEFAULT_PROJECT_NAME}
Raw scribble title: {request.title or "(無題)"}
Raw scribble content:
"""
{request.content}
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
{{
  "structuredTitle": "Clear Short Title",
  "structuredContent": "Complete formatted Markdown string"
}}'''


def build_generate_prd_prompt(request: GeneratePrdRequest) -> str:
    """複数メモから PRD を生成するプロンプト"""
    notes_content = "\n---\n".join(
        f"[Note #{index + 1}] ID: {n.id} | Section: {n.section_name or 'General'} | "
        f"Title: {n.title or '(無題)'}\nContent:\n{n.content}\n"
        for index, n in enumerate(request.notes)
    )

    mode_instructions = MODE_INSTRUCTIONS[request.mode or DEFAULT_GENERATION_MODE]
    detail_instructions = DETAIL_INSTRUCTIONS[request.detail_level or DEFAULT_DETAIL_LEVEL]
    existing_prd = (
        f"Previous PRD Reference:\n{request.existing_prd[:EXISTING_PRD_CONTEXT_MAX_CHARS]}"
        if request.existing_prd
        else ""
    )

    system_prompt = f"""You are a senior product manager. Transform fragmented user notes into a clear, concise, actionable Product Requirements Document (PRD) in Japanese.
Rules:
1. Treat user notes as primary truth. Never invent business facts or budgets.
2. Distinguish confirmed facts, AI proposals, and open questions.
3. Be high-density, crisp, and direct. Avoid unnecessary fluff to maximize generation speed.

Project: {request.project_name}
Mode: {mode_instructions}
Detail: {detail_instructions}
{existing_prd}"""

    user_prompt = f"""Source notes:
{notes_content}

Output strictly valid JSON with this shape:
{{
  "markdown": "Complete Markdown PRD in Japanese",
  "facts": [
    {{ "id": "fact-1", "text": "fact summary", "sourceNoteId": "note-id", "sourceNoteTitle": "note title" }}
  ],
  "proposals": [
    {{ "id": "prop-1", "category": "category", "title": "proposal title", "description": "detail", "impact": "high|medium|low" }}
  ],
  "openQuestions": [
    {{ "id": "oq-1", "question": "question", "context": "context", "urgency": "critical|normal" }}
  ],
  "contradictions": []
}}"""

    return f"{system_prompt}\n\n{user_prompt}"
