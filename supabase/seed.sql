-- ========================================================
-- Idea Workspace: コンテンツの初期データ（src/config/seed.ts から生成）
--   何度実行しても重複しない。内容を変えるときは新しい version の sample_contents を追加し、
--   is_active を切り替える（有効なサンプルは 1 件まで）
--
-- sample_contents.content の形式:
--   project:     { name, description }
--   sections:    [{ key, name, icon, position }]
--   notes:       [{ key, sectionKey, title, content, position, createdHoursAgo, updatedHoursAgo }]
--   prds:        [{ key, title, content, generationMode, detailLevel, sourceNoteKeys, facts, proposals,
--                   openQuestions, contradictions, version, createdHoursAgo, updatedHoursAgo }]
--   preferences: { paneCount, panes: [{ id, noteKey }], activePaneId }
--   key / sectionKey / noteKey はサンプル内の参照用。複製時に uuid を振り直す
-- ========================================================

insert into idea_ws.section_templates (name, icon, position)
select v.name, v.icon, v.position
from (values
  ('Inbox (思いつき)', 'Inbox', 0),
  ('Problem & Users (課題・ユーザー)', 'Users', 1),
  ('Features & Ideas (機能・アイデア)', 'Lightbulb', 2),
  ('PRD (生成された仕様書)', 'FileText', 3)
) as v (name, icon, position)
where not exists (select 1 from idea_ws.section_templates);

insert into idea_ws.sample_contents (version, is_active, content)
values (1, true, $sample${
  "project": {
    "name": "Idea Workspace (思考からPRDへ)",
    "description": "断片的な思考を開発可能なPRDへ育てるワークスペース"
  },
  "sections": [
    {
      "key": "inbox",
      "name": "Inbox (思いつき・素早いメモ)",
      "icon": "Inbox",
      "position": 0
    },
    {
      "key": "problem-users",
      "name": "Problem & Users (課題・ユーザー)",
      "icon": "Users",
      "position": 1
    },
    {
      "key": "features-ideas",
      "name": "Features & Ideas (機能・アイデア)",
      "icon": "Lightbulb",
      "position": 2
    },
    {
      "key": "prd",
      "name": "PRD (生成・編集した仕様書)",
      "icon": "FileText",
      "position": 3
    }
  ],
  "notes": [
    {
      "key": "01-inbox-capture",
      "sectionKey": "inbox",
      "title": "思いつきを0秒で書けるキャプチャ体験",
      "content": "# 思考を止めないキャプチャ\n- 思いついた瞬間、分類やタイトルを考える必要をなくしたい\n- タイトルが空でも、本文の1行目を自動でタイトルプレビューにすれば良い\n- ショートカットキー「Cmd + N」またはヘッダーの「+ メモ」で即座に入力開始\n- 自動保存で、保存忘れによるデータ消失を完全に防止する",
      "position": 0,
      "createdHoursAgo": 24,
      "updatedHoursAgo": 12
    },
    {
      "key": "02-target-pain",
      "sectionKey": "problem-users",
      "title": "ターゲット層とAIコーディング時のペイン",
      "content": "# ターゲットユーザー\n- 個人開発者、vibe coder、新規プロダクトのPdM\n- Claude CodeやCursor、WindsurfなどのAIエージェントを活用する開発者\n\n# 現状の課題（ペイン）\n1. AIコーディングツールを使う際、指示が雑だとハルシネーションが起きたり意図と違う設計になる\n2. しかし、最初から完璧なPRD（要件定義書）を手書きするのは心理的ハードルが高すぎる\n3. 日常のメモや気づきが散逸しており、開発仕様書へ変換する作業に多くの時間が取られている",
      "position": 0,
      "createdHoursAgo": 20,
      "updatedHoursAgo": 8
    },
    {
      "key": "03-multipane",
      "sectionKey": "features-ideas",
      "title": "1〜4ペインの柔軟な分割表示",
      "content": "# マルチペイン思考環境\n- 1画面（集中執筆）、2画面（左右比較）、3画面、4画面（2x2グリッド）を1クリックで切り替え\n- ペインごとに任意のメモを自由に割り当て可能\n- 例：\n  - 左ペイン：ユーザー課題\n  - 右ペイン：機能要件\n  - 下ペイン：実装技術メモやAPI設計\n- どのペインの編集もリアルタイムに自動保存される",
      "position": 0,
      "createdHoursAgo": 18,
      "updatedHoursAgo": 6
    },
    {
      "key": "04-ai-modes",
      "sectionKey": "features-ideas",
      "title": "AIの3つの生成モード（厳密・提案・拡張）",
      "content": "# 信頼できるAI仕様書生成\n1. **Mode A: 厳密 (Strict)**\n   - ユーザーのメモにある事実のみを使用\n   - 不足情報は勝手に創作せず「未定」「要確認」と明記\n2. **Mode B: 整理＆提案 (Organize & Suggest) [デフォルト]**\n   - 原文の意図を汲んで構成を整え、必要な要件を提案としてラベル付け\n3. **Mode C: 仮説拡張 (Expand)**\n   - KPI候補、リスク要因、将来の拡張ロードマップまで積極提案\n\n# 出力分類\n- FACT: 原文で確認できる確実な情報\n- PROPOSAL: AIによる補足・提案\n- OPEN_QUESTION: ユーザーの意思決定が必要な未解決事項",
      "position": 1,
      "createdHoursAgo": 15,
      "updatedHoursAgo": 4
    },
    {
      "key": "05-inbox-export",
      "sectionKey": "inbox",
      "title": "生成したPRDをAIエージェントに渡すエクスポート",
      "content": "# 実装へのシームレスな接続\n- 生成されたPRDをワンクリックで「Cursor / Claude Code用プロンプト」形式でクリップボードにコピー\n- Markdownファイル（.md）のダウンロード\n- 将来的にGitHub Issueへの直接起票も視野に入れる",
      "position": 1,
      "createdHoursAgo": 10,
      "updatedHoursAgo": 2
    }
  ],
  "prds": [
    {
      "key": "sample-01",
      "title": "Idea Workspace MVP 仕様書 (v1.0)",
      "content": "# Idea Workspace — Product Requirements Document (MVP)\n\n## 1. プロダクト概要\n思いつきを逃さず、断片的な思考を開発・検証できるプロダクト企画（PRD）へと育てるWebワークスペース。\nユーザーが作りたいもの、解決したい課題、技術的な気づきなどを自由に記録し、AIによって構造化されたPRDへ変換する。\n\n## 2. ターゲットユーザー & 課題\n- **対象**: 個人開発者、AIコーディングツール（Claude Code, Cursor, Windsurf）を活用するエンジニア、PdM\n- **課題**: \n  - AIコーディングに渡す仕様が曖昧だと意図しないコードが生成される\n  - 最初から完璧な要件定義書を書くのは心理的負担が大きい\n  - アイデアの断片が散逸し、仕様書へまとめる時間が惜しい\n\n## 3. 主要機能要件\n### 3.1 摩擦ゼロのメモキャプチャ\n- Inboxから1クリックですぐにメモ入力開始\n- タイトル未設定でも本文1行目で自動表示\n- 入力中の自動保存（データ消失ゼロ保証）\n\n### 3.2 1〜4ペインのマルチビュー\n- 1画面、2画面（左右）、3画面、4画面（2x2グリッド）の切替\n- ペインごとに任意のメモを自由に表示・同時編集\n\n### 3.3 AIによるPRD生成\n- 複数メモを選択してPRDを生成\n- 3つの生成モード:\n  - **厳密 (Strict)**: 原文の事実のみ。不足は「未定」と記載\n  - **整理＆提案 (Suggest)**: 不足を補い、改善提案をラベル付け\n  - **仮説拡張 (Expand)**: KPIやリスク、検証方法まで拡張\n- AI出力を FACT / PROPOSAL / OPEN QUESTION に分類\n\n### 3.4 エクスポート＆バージョン管理\n- Markdownコピー、.mdダウンロード\n- AIコーディング用システムプロンプト形式コピー\n- PRDの版管理（v1, v2...）\n\n## 4. データモデル概要\n- **Projects**: プロダクトの企画単位\n- **Sections**: プロジェクト内の思考分類（Inbox, 課題, 機能等）\n- **Notes**: 思考の断片（Title, Content, UpdatedAt）\n- **PrdDocuments**: 生成された仕様書（独立した成果物）\n\n## 5. MVPスコープ外（Non-goals）\n- リアルタイム共同編集\n- 複雑なガントチャート・タスク管理\n- GitHubへの自動コミット・エージェント実行",
      "generationMode": "suggest",
      "detailLevel": "standard",
      "sourceNoteKeys": [
        "01-inbox-capture",
        "02-target-pain",
        "03-multipane",
        "04-ai-modes"
      ],
      "facts": [
        {
          "id": "f1",
          "text": "ターゲットは個人開発者、vibe coder、新規プロダクトPdMなどのAIコーディング利用者",
          "sourceNoteTitle": "ターゲット層とAIコーディング時のペイン"
        },
        {
          "id": "f2",
          "text": "1〜4ペインのマルチペイン分割（1分割、左右2分割、3分割、2x2の4分割）をサポートする",
          "sourceNoteTitle": "1〜4ペインの柔軟な分割表示"
        },
        {
          "id": "f3",
          "text": "入力の手間を減らすためタイトルなしでも本文1行目で保存・表示可能",
          "sourceNoteTitle": "思いつきを0秒で書けるキャプチャ体験"
        },
        {
          "id": "f4",
          "text": "AI生成は「厳密」「整理提案」「仮説拡張」の3モードを提供する",
          "sourceNoteTitle": "AIの3つの生成モード（厳密・提案・拡張）"
        }
      ],
      "proposals": [
        {
          "id": "p1",
          "category": "UX / 仕様",
          "title": "ペイン状態の自動ローカル永続化",
          "description": "リロード時も開いていたペインとメモの組み合わせを直前と同じ状態で復元する",
          "impact": "high"
        },
        {
          "id": "p2",
          "category": "AI連携",
          "title": "AIコーディングツール用ワンクリック出力",
          "description": "Claude CodeやCursor rules用にシステムプロンプト付きのMarkdownを出力する",
          "impact": "high"
        },
        {
          "id": "p3",
          "category": "安全機構",
          "title": "PRD更新時の元メモ非破壊保証",
          "description": "PRDの再生成やバージョン更新を行っても元の思考メモは絶対に上書きしない",
          "impact": "medium"
        }
      ],
      "openQuestions": [
        {
          "id": "q1",
          "question": "ペイン間のメモドラッグ＆ドロップ移動のサポート時期",
          "context": "MVPではセレクターによる切り替えで十分か、初期からDnDが必要か",
          "urgency": "normal"
        },
        {
          "id": "q2",
          "question": "チーム共同編集の導入計画",
          "context": "初期は個人利用に特化し、将来Supabase Realtimeで共同作業を追加するか",
          "urgency": "normal"
        }
      ],
      "contradictions": [],
      "version": 1,
      "createdHoursAgo": 2,
      "updatedHoursAgo": 2
    }
  ],
  "preferences": {
    "paneCount": 2,
    "panes": [
      {
        "id": "pane-0",
        "noteKey": "01-inbox-capture"
      },
      {
        "id": "pane-1",
        "noteKey": "02-target-pain"
      },
      {
        "id": "pane-2",
        "noteKey": null
      },
      {
        "id": "pane-3",
        "noteKey": null
      }
    ],
    "activePaneId": "pane-0"
  }
}$sample$::jsonb)
on conflict (version) do nothing;
