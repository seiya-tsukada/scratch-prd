"""AI へのプロンプト（server/prompts.ts からの移植）"""

from __future__ import annotations

from backend.app.config import DEFAULT_PROJECT_NAME
from backend.app.models.ai import (
    DEFAULT_DETAIL_LEVEL,
    DEFAULT_GENERATION_MODE,
    GeneratePrdRequest,
    PrdDetailLevel,
    PrdGenerationMode,
    PreviousPrd,
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


CONTRADICTION_RULES = """Contradictions:
- Compare the notes with each other. If two or more notes disagree (target users, scope, requirements, priorities, numbers, platforms, deadlines, etc.), add one item to "contradictions" per disagreement.
- "issue": explain in Japanese what disagrees and why it matters, quoting both sides briefly.
- "notesInvolved": the exact note IDs (from "ID: ...") of every note involved. Never use titles here.
- Do not resolve the contradiction yourself in the PRD; mention it as undecided and add a matching open question.
- If there is no disagreement, return an empty array. Do not invent contradictions.
Example: {"id": "c-1", "issue": "対象ユーザーが矛盾: メモAは「個人開発者向け」、メモBは「企業の開発チーム向け」としている", "notesInvolved": ["<note id A>", "<note id B>"]}"""


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items) if items else "- (なし)"


def build_previous_prd_context(previous: PreviousPrd) -> str:
    """前回の PRD の要約。見出し構成を保ち、決定事項は確定した事実として扱わせる"""
    open_questions = [f"{q.question}（{q.context}）" if q.context else q.question for q in previous.open_questions]
    decisions = [f"Q: {d.question} → A: {d.answer}" for d in previous.decisions]
    return f"""This is a regeneration of an existing PRD{f" titled「{previous.title}」" if previous.title else ""}. Previous PRD summary:
Section outline (keep this structure unless the notes require a change):
{_bullets(previous.headings)}
Confirmed facts in the previous version (keep them unless the notes contradict them):
{_bullets(previous.facts)}
Open questions in the previous version:
{_bullets(open_questions)}
Decisions made by the user (answers to open questions):
{_bullets(decisions)}
Rules for regeneration:
- Treat every decision as a confirmed fact: reflect it in the PRD body and include it in "facts".
- Remove open questions that a decision answers. Keep the other open questions unless the notes answer them."""


def build_generate_prd_prompt(request: GeneratePrdRequest) -> str:
    """複数メモから PRD を生成するプロンプト"""
    notes_content = "\n---\n".join(
        f"[Note #{index + 1}] ID: {n.id} | Section: {n.section_name or 'General'} | "
        f"Title: {n.title or '(無題)'}\nContent:\n{n.content}\n"
        for index, n in enumerate(request.notes)
    )

    mode_instructions = MODE_INSTRUCTIONS[request.mode or DEFAULT_GENERATION_MODE]
    detail_instructions = DETAIL_INSTRUCTIONS[request.detail_level or DEFAULT_DETAIL_LEVEL]
    previous_prd = build_previous_prd_context(request.previous_prd) if request.previous_prd else ""

    system_prompt = f"""You are a senior product manager. Transform fragmented user notes into a clear, concise, actionable Product Requirements Document (PRD) in Japanese.
Rules:
1. Treat user notes as primary truth. Never invent business facts or budgets.
2. Distinguish confirmed facts, AI proposals, and open questions.
3. Be high-density, crisp, and direct. Avoid unnecessary fluff to maximize generation speed.

Project: {request.project_name}
Mode: {mode_instructions}
Detail: {detail_instructions}
{CONTRADICTION_RULES}
{previous_prd}"""

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
  "contradictions": [
    {{ "id": "c-1", "issue": "what disagrees between notes", "notesInvolved": ["note-id", "note-id"] }}
  ]
}}"""

    return f"{system_prompt}\n\n{user_prompt}"
