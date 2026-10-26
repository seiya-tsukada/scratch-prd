"""Gemini API が使えない（キー未設定・通信エラー・応答不正）場合の内蔵ジェネレータ（server/fallbacks.ts からの移植）"""

from __future__ import annotations

import re
from datetime import datetime

from backend.app.config import DEFAULT_PROJECT_NAME, DISPLAY_TIMEZONE, MOCK_FACT_MAX_CHARS, UNTITLED_NOTE_LABEL
from backend.app.models.ai import (
    GeneratedPrd,
    GeneratePrdRequest,
    PrdDetailLevel,
    PrdFact,
    PrdGenerationMode,
    PrdOpenQuestion,
    PrdProposal,
    StructuredNote,
)

DEFAULT_ROUGH_NOTE_HEADING = "機能アイデア仕様"
DEFAULT_STRUCTURED_TITLE = "構造化PRDメモ"
ERROR_FALLBACK_TITLE = "構造化メモ"
FALLBACK_PRD_MARKDOWN = "# 生成されたPRD\n\n内容を生成しました。"

# Markdown の強制改行（行末の半角スペース 2 つ）。エディタに消されないよう定数にしている
MD_LINE_BREAK = "  "

MODE_BADGES: dict[PrdGenerationMode, str] = {
    "strict": "【厳密モード (Strict)】メモ記載の事実のみで構成。推測・追加なし",
    "suggest": "【整理・提案モード (Organize & Suggest)】原文の意図を整理し、不足部分に提案ラベルを付与",
    "expand": "【仮説拡張モード (Expand)】KPI・リスク・将来機能まで仮説として積極提案",
}

# src/config/prd.ts の PRD_DETAIL_LEVEL_LABELS と同じ
DETAIL_LEVEL_LABELS: dict[PrdDetailLevel, str] = {
    "brief": "簡易",
    "standard": "標準",
    "detailed": "詳細",
}

BASE_PROPOSALS = [
    PrdProposal(
        id="prop-1",
        category="データ整合性",
        title="ノート変更とPRDのバージョン履歴管理",
        description="PRDを再生成する際、過去のPRDを破壊せず履歴として保持し差分比較できるようにする",
        impact="high",
    ),
    PrdProposal(
        id="prop-2",
        category="UX / エディタ",
        title="クイックキャプチャ用キーボードショートカット (Cmd+K / Cmd+N)",
        description="どの画面にいても瞬時にInboxへメモを追加できるホットキーを提供",
        impact="medium",
    ),
]

EXPAND_PROPOSALS = [
    PrdProposal(
        id="prop-3",
        category="AI / 拡張構想",
        title="Cursor & Claude Code向けプロンプト形式プリセット生成",
        description="生成した仕様をAIエージェントにそのまま投入できる形式でワンクリック出力",
        impact="high",
    ),
    PrdProposal(
        id="prop-4",
        category="プロダクト検証",
        title="初期KPI：メモ作成から7日後の再訪率とPRD出力数",
        description="思考の定着度と実際の開発移行率を測定する指標ダッシュボードの設置",
        impact="medium",
    ),
]

MOCK_OPEN_QUESTIONS = [
    PrdOpenQuestion(
        id="oq-1",
        question="ペイン間のメモドラッグ＆ドロップ配置のサポート優先度",
        context="MVPではドロップダウン切り替えで十分か、初期からドラッグ操作を提供するか",
        urgency="normal",
    ),
    PrdOpenQuestion(
        id="oq-2",
        question="オフライン時の同期競合解決ポリシー",
        context="複数端末で同時編集された場合、ラストライト優先かマージダイアログを表示するか",
        urgency="critical",
    ),
]

_HEADING_PREFIX = re.compile(r"^#+\s*")
_BULLET_PREFIX = re.compile(r"^[-*•]\s*")


def _first_line_of(content: str) -> str:
    return _HEADING_PREFIX.sub("", content.split("\n")[0], count=1)


def _strip_bullet(line: str) -> str:
    return _BULLET_PREFIX.sub("", line, count=1)


def _format_datetime(value: datetime) -> str:
    """JavaScript の toLocaleString('ja-JP') と同じ形式（例: 2026/1/5 9:03:07）"""
    local = value.astimezone(DISPLAY_TIMEZONE)
    return f"{local.year}/{local.month}/{local.day} {local.hour}:{local:%M}:{local:%S}"


def generate_mock_prd(request: GeneratePrdRequest, *, now: datetime | None = None) -> GeneratedPrd:
    """キー未設定時・AIエラー時に返す構造化済み PRD"""
    project_name = request.project_name
    notes = request.notes
    is_strict = request.mode == "strict"
    is_expand = request.mode == "expand"

    facts = [
        PrdFact(
            id=f"fact-{i + 1}",
            text=(
                f"{n.title}: {n.content[:MOCK_FACT_MAX_CHARS].replace(chr(10), ' ')}"
                if n.title
                else n.content[:MOCK_FACT_MAX_CHARS]
            ),
            source_note_id=n.id,
            source_note_title=n.title or UNTITLED_NOTE_LABEL,
        )
        for i, n in enumerate(notes)
    ]

    proposals = [] if is_strict else [*BASE_PROPOSALS, *(EXPAND_PROPOSALS if is_expand else [])]
    open_questions = MOCK_OPEN_QUESTIONS
    mode_badge = MODE_BADGES.get(request.mode or "expand", MODE_BADGES["expand"])
    detail_label = DETAIL_LEVEL_LABELS.get(request.detail_level or "standard", DETAIL_LEVEL_LABELS["standard"])
    created_at = _format_datetime(now or datetime.now(DISPLAY_TIMEZONE))

    background_facts = "\n".join(f"- **{n.title or UNTITLED_NOTE_LABEL}**: {_first_line_of(n.content)}" for n in notes)
    proposal_section = (
        ""
        if is_strict
        else "---\n\n## 6. AI提案と推奨設計 [PROPOSAL]\n"
        + "\n".join(f"- **[{p.category}] {p.title}** (重要度: {p.impact}): {p.description}" for p in proposals)
        + "\n"
    )
    open_question_lines = "\n".join(f"- ❓ **{q.question}**: {q.context} (緊急度: {q.urgency})" for q in open_questions)

    markdown = f"""# {project_name or DEFAULT_PROJECT_NAME} — Product Requirements Document (PRD)

> 生成モード: **{mode_badge}**{MD_LINE_BREAK}
> 詳細度: **{detail_label}**{MD_LINE_BREAK}
> 参照ノート数: **{len(notes)}件** | 作成日時: **{created_at}**

---

## 1. プロダクト概要 (Product Overview)
{project_name} は、散逸しがちな開発者の思いつきや断片的なメモを逃さず、開発・検証可能な構造化PRDへと育てるためのワークスペースである。
ユーザーが思考を止めずに素早く記録し、AIが事実と仮説を区別しながら実装可能な仕様書を自動構成する。

---

## 2. 課題と背景 (Background & Problem)
### 原文ノートに基づく確認事項 [FACT]
{background_facts}

### 解決する課題
1. **アイデアの散逸**: 思いつきがチャットや別々のノートに散らばり、仕様としてまとまらない
2. **AIコーディング時の指示精度**: Claude CodeやCursorなどのAIエージェントに渡す仕様が粗いと手戻りが発生する
3. **仕様書作成の高コスト**: 最初から綺麗なPRDを書くのは心理的ハードルが高い

---

## 3. ターゲットユーザー (Target Users)
- **Primary**: 個人開発者、AIコーディングを活用するエンジニア、vibe coder
- **Secondary**: 新規事業のPdM、小規模スタートアップのファウンダー

---

## 4. 目標とスコープ (Goals & Non-goals)
### Goals (MVP)
- 1プロジェクト内で複数のセクションとメモを管理
- 1〜4ペインの柔軟な分割表示による並行思考
- 入力中の高速自動保存（データ消失ゼロ保証）
- 複数メモを選択したPRD生成（厳密・提案・拡張の3モード）
- PRDの版管理（v1, v2...）とMarkdown出力

### Non-goals (MVPスコープ外)
- チームリアルタイム共同編集
- 複雑なガントチャート・タスク管理
- GitHubへの自動コミット・エージェント実行

---

## 5. 機能要件 (Functional Requirements)
### 5.1 メモキャプチャ機能
- **FR-01**: Inboxから1クリックですぐにメモ作成・入力フォーカス
- **FR-02**: タイトルが空の場合は本文の1行目をプレビュータイトルとして自動採用
- **FR-03**: タイピングを妨げないバックグラウンド自動保存

### 5.2 マルチペインワークスペース
- **FR-04**: 1ペイン、左右2ペイン、3ペイン、2x2の4ペインの即時切替
- **FR-05**: ペインごとに開くメモを自由に選択・維持
- **FR-06**: ペイン状態および開いているメモのブラウザ永続化

### 5.3 AI仕様書生成エンジン
- **FR-07**: 選択したメモ群を解析し、FACT（事実）・PROPOSAL（提案）・OPEN QUESTION（未決事項）に分類
- **FR-08**: モード切替（厳密・整理提案・仮説拡張）に応じたAIプロンプトの出し分け
- **FR-09**: 元のメモを破壊・上書きしない安全なPRD保存アーキテクチャ

{proposal_section}
---

## 7. 未解決の論点 (Open Questions) [OPEN_QUESTION]
{open_question_lines}

---

## 8. 将来のロードマップ (Future Roadmap)
- [ ] AIコーディングツール（Cursor, Claude Code, Windsurf）専用プロンプト出力
- [ ] PRDのバージョン間差分ビジュアライザー
- [ ] Supabase Auth & PostgreSQLによる完全クラウド同期
"""

    return GeneratedPrd(
        markdown=markdown,
        facts=facts,
        proposals=proposals,
        open_questions=open_questions,
        contradictions=[],
    )


def structure_rough_note_locally(title: str | None, content: str) -> StructuredNote:
    """キー未設定時に、メモの行をそのまま PRD 形式の見出しへ割り振る"""
    lines = [line for line in content.strip().split("\n") if line]
    heading = (title or "").strip() or (_HEADING_PREFIX.sub("", lines[0], count=1) if lines else "")
    heading = heading or DEFAULT_ROUGH_NOTE_HEADING
    problem_lines = "\n- ".join(_strip_bullet(line) for line in lines[:3])
    requirement_lines = "\n- [ ] ".join(_strip_bullet(line) for line in lines)

    structured_content = f"""# {heading}

## 1. 概要 (Overview)
{" ".join(lines[:2])}

## 2. 解決する課題・背景 (Problem & Context)
- {problem_lines}

## 3. 主要要件・コア仕様 (Key Requirements)
- [ ] {requirement_lines}

## 4. UI / 実装メモ (Implementation Ideas)
- 思考の断片から抽出された要件を実装ベースに落とし込む
- 不要な複雑さを避け、MVPスコープに収める

## 5. 未解決事項・メモ (Open Questions)
- ❓ 具体的な受け入れ基準・エッジケースの確認が必要"""

    return StructuredNote(structured_title=heading, structured_content=structured_content)


def build_rough_note_error_fallback(title: str | None, content: str) -> StructuredNote:
    """AI 呼び出しが失敗したときに最低限の構造で返す"""
    fallback_title = title or ERROR_FALLBACK_TITLE
    fallback_content = (
        f"# {fallback_title}\n\n## 1. 概要\n{content}\n\n## 2. 主要要件\n- [ ] 要件の具体化\n- [ ] 実装スコープの確定"
    )
    return StructuredNote(structured_title=fallback_title, structured_content=fallback_content)
