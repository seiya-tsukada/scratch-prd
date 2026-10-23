/**
 * 初回起動時に投入するサンプルデータと、新規作成時のデフォルト値。
 */
import type { Note, PaneInfo, PrdDocument, Section, UserProfile } from '../types';

export const DEFAULT_USER: UserProfile = {
  id: 'usr-default-01',
  email: 'creator@idea-workspace.local',
  displayName: '開発者 / PdM',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
};

export const INITIAL_PROJECT_ID = 'proj-idea-workspace';

export const INITIAL_PROJECT = {
  name: 'Idea Workspace (思考からPRDへ)',
  description: '断片的な思考を開発可能なPRDへ育てるワークスペース',
};

export const INITIAL_SECTIONS: Section[] = [
  {
    id: 'sec-inbox',
    projectId: INITIAL_PROJECT_ID,
    userId: DEFAULT_USER.id,
    name: 'Inbox (思いつき・素早いメモ)',
    position: 0,
    icon: 'Inbox',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sec-problem-users',
    projectId: INITIAL_PROJECT_ID,
    userId: DEFAULT_USER.id,
    name: 'Problem & Users (課題・ユーザー)',
    position: 1,
    icon: 'Users',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sec-features-ideas',
    projectId: INITIAL_PROJECT_ID,
    userId: DEFAULT_USER.id,
    name: 'Features & Ideas (機能・アイデア)',
    position: 2,
    icon: 'Lightbulb',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sec-prd',
    projectId: INITIAL_PROJECT_ID,
    userId: DEFAULT_USER.id,
    name: 'PRD (生成・編集した仕様書)',
    position: 3,
    icon: 'FileText',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const INITIAL_NOTES: Note[] = [
  {
    id: 'note-01-inbox-capture',
    projectId: INITIAL_PROJECT_ID,
    sectionId: 'sec-inbox',
    userId: DEFAULT_USER.id,
    title: '思いつきを0秒で書けるキャプチャ体験',
    content: `# 思考を止めないキャプチャ
- 思いついた瞬間、分類やタイトルを考える必要をなくしたい
- タイトルが空でも、本文の1行目を自動でタイトルプレビューにすれば良い
- ショートカットキー「Cmd + N」またはヘッダーの「+ メモ」で即座に入力開始
- 自動保存で、保存忘れによるデータ消失を完全に防止する`,
    position: 0,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'note-02-target-pain',
    projectId: INITIAL_PROJECT_ID,
    sectionId: 'sec-problem-users',
    userId: DEFAULT_USER.id,
    title: 'ターゲット層とAIコーディング時のペイン',
    content: `# ターゲットユーザー
- 個人開発者、vibe coder、新規プロダクトのPdM
- Claude CodeやCursor、WindsurfなどのAIエージェントを活用する開発者

# 現状の課題（ペイン）
1. AIコーディングツールを使う際、指示が雑だとハルシネーションが起きたり意図と違う設計になる
2. しかし、最初から完璧なPRD（要件定義書）を手書きするのは心理的ハードルが高すぎる
3. 日常のメモや気づきが散逸しており、開発仕様書へ変換する作業に多くの時間が取られている`,
    position: 0,
    createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
  {
    id: 'note-03-multipane',
    projectId: INITIAL_PROJECT_ID,
    sectionId: 'sec-features-ideas',
    userId: DEFAULT_USER.id,
    title: '1〜4ペインの柔軟な分割表示',
    content: `# マルチペイン思考環境
- 1画面（集中執筆）、2画面（左右比較）、3画面、4画面（2x2グリッド）を1クリックで切り替え
- ペインごとに任意のメモを自由に割り当て可能
- 例：
  - 左ペイン：ユーザー課題
  - 右ペイン：機能要件
  - 下ペイン：実装技術メモやAPI設計
- どのペインの編集もリアルタイムに自動保存される`,
    position: 0,
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
  {
    id: 'note-04-ai-modes',
    projectId: INITIAL_PROJECT_ID,
    sectionId: 'sec-features-ideas',
    userId: DEFAULT_USER.id,
    title: 'AIの3つの生成モード（厳密・提案・拡張）',
    content: `# 信頼できるAI仕様書生成
1. **Mode A: 厳密 (Strict)**
   - ユーザーのメモにある事実のみを使用
   - 不足情報は勝手に創作せず「未定」「要確認」と明記
2. **Mode B: 整理＆提案 (Organize & Suggest) [デフォルト]**
   - 原文の意図を汲んで構成を整え、必要な要件を提案としてラベル付け
3. **Mode C: 仮説拡張 (Expand)**
   - KPI候補、リスク要因、将来の拡張ロードマップまで積極提案

# 出力分類
- FACT: 原文で確認できる確実な情報
- PROPOSAL: AIによる補足・提案
- OPEN_QUESTION: ユーザーの意思決定が必要な未解決事項`,
    position: 1,
    createdAt: new Date(Date.now() - 3600000 * 15).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'note-05-inbox-export',
    projectId: INITIAL_PROJECT_ID,
    sectionId: 'sec-inbox',
    userId: DEFAULT_USER.id,
    title: '生成したPRDをAIエージェントに渡すエクスポート',
    content: `# 実装へのシームレスな接続
- 生成されたPRDをワンクリックで「Cursor / Claude Code用プロンプト」形式でクリップボードにコピー
- Markdownファイル（.md）のダウンロード
- 将来的にGitHub Issueへの直接起票も視野に入れる`,
    position: 1,
    createdAt: new Date(Date.now() - 3600000 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

export const INITIAL_PRD: PrdDocument = {
  id: 'prd-sample-01',
  projectId: INITIAL_PROJECT_ID,
  userId: DEFAULT_USER.id,
  title: 'Idea Workspace MVP 仕様書 (v1.0)',
  generationMode: 'suggest',
  detailLevel: 'standard',
  sourceNoteIds: [
    'note-01-inbox-capture',
    'note-02-target-pain',
    'note-03-multipane',
    'note-04-ai-modes',
  ],
  version: 1,
  facts: [
    {
      id: 'f1',
      text: 'ターゲットは個人開発者、vibe coder、新規プロダクトPdMなどのAIコーディング利用者',
      sourceNoteTitle: 'ターゲット層とAIコーディング時のペイン',
    },
    {
      id: 'f2',
      text: '1〜4ペインのマルチペイン分割（1分割、左右2分割、3分割、2x2の4分割）をサポートする',
      sourceNoteTitle: '1〜4ペインの柔軟な分割表示',
    },
    {
      id: 'f3',
      text: '入力の手間を減らすためタイトルなしでも本文1行目で保存・表示可能',
      sourceNoteTitle: '思いつきを0秒で書けるキャプチャ体験',
    },
    {
      id: 'f4',
      text: 'AI生成は「厳密」「整理提案」「仮説拡張」の3モードを提供する',
      sourceNoteTitle: 'AIの3つの生成モード（厳密・提案・拡張）',
    },
  ],
  proposals: [
    {
      id: 'p1',
      category: 'UX / 仕様',
      title: 'ペイン状態の自動ローカル永続化',
      description: 'リロード時も開いていたペインとメモの組み合わせを直前と同じ状態で復元する',
      impact: 'high',
    },
    {
      id: 'p2',
      category: 'AI連携',
      title: 'AIコーディングツール用ワンクリック出力',
      description: 'Claude CodeやCursor rules用にシステムプロンプト付きのMarkdownを出力する',
      impact: 'high',
    },
    {
      id: 'p3',
      category: '安全機構',
      title: 'PRD更新時の元メモ非破壊保証',
      description: 'PRDの再生成やバージョン更新を行っても元の思考メモは絶対に上書きしない',
      impact: 'medium',
    },
  ],
  openQuestions: [
    {
      id: 'q1',
      question: 'ペイン間のメモドラッグ＆ドロップ移動のサポート時期',
      context: 'MVPではセレクターによる切り替えで十分か、初期からDnDが必要か',
      urgency: 'normal',
    },
    {
      id: 'q2',
      question: 'チーム共同編集の導入計画',
      context: '初期は個人利用に特化し、将来Supabase Realtimeで共同作業を追加するか',
      urgency: 'normal',
    },
  ],
  contradictions: [],
  content: `# Idea Workspace — Product Requirements Document (MVP)

## 1. プロダクト概要
思いつきを逃さず、断片的な思考を開発・検証できるプロダクト企画（PRD）へと育てるWebワークスペース。
ユーザーが作りたいもの、解決したい課題、技術的な気づきなどを自由に記録し、AIによって構造化されたPRDへ変換する。

## 2. ターゲットユーザー & 課題
- **対象**: 個人開発者、AIコーディングツール（Claude Code, Cursor, Windsurf）を活用するエンジニア、PdM
- **課題**: 
  - AIコーディングに渡す仕様が曖昧だと意図しないコードが生成される
  - 最初から完璧な要件定義書を書くのは心理的負担が大きい
  - アイデアの断片が散逸し、仕様書へまとめる時間が惜しい

## 3. 主要機能要件
### 3.1 摩擦ゼロのメモキャプチャ
- Inboxから1クリックですぐにメモ入力開始
- タイトル未設定でも本文1行目で自動表示
- 入力中の自動保存（データ消失ゼロ保証）

### 3.2 1〜4ペインのマルチビュー
- 1画面、2画面（左右）、3画面、4画面（2x2グリッド）の切替
- ペインごとに任意のメモを自由に表示・同時編集

### 3.3 AIによるPRD生成
- 複数メモを選択してPRDを生成
- 3つの生成モード:
  - **厳密 (Strict)**: 原文の事実のみ。不足は「未定」と記載
  - **整理＆提案 (Suggest)**: 不足を補い、改善提案をラベル付け
  - **仮説拡張 (Expand)**: KPIやリスク、検証方法まで拡張
- AI出力を FACT / PROPOSAL / OPEN QUESTION に分類

### 3.4 エクスポート＆バージョン管理
- Markdownコピー、.mdダウンロード
- AIコーディング用システムプロンプト形式コピー
- PRDの版管理（v1, v2...）

## 4. データモデル概要
- **Projects**: プロダクトの企画単位
- **Sections**: プロジェクト内の思考分類（Inbox, 課題, 機能等）
- **Notes**: 思考の断片（Title, Content, UpdatedAt）
- **PrdDocuments**: 生成された仕様書（独立した成果物）

## 5. MVPスコープ外（Non-goals）
- リアルタイム共同編集
- 複雑なガントチャート・タスク管理
- GitHubへの自動コミット・エージェント実行`,
  createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
};

/** 新規プロジェクト作成時に自動生成するセクション */
export const NEW_PROJECT_SECTION_TEMPLATES: Pick<Section, 'name' | 'icon'>[] = [
  { name: 'Inbox (思いつき)', icon: 'Inbox' },
  { name: 'Problem & Users (課題・ユーザー)', icon: 'Users' },
  { name: 'Features & Ideas (機能・アイデア)', icon: 'Lightbulb' },
  { name: 'PRD (生成された仕様書)', icon: 'FileText' },
];

/** ユーザーが追加したセクションのアイコン */
export const CUSTOM_SECTION_ICON = 'Folder';

/** ワークスペース設定が未保存のプロジェクトで最初に開くペイン構成 */
export const DEFAULT_PANE_ASSIGNMENTS: PaneInfo[] = [
  { id: 'pane-0', noteId: 'note-01-inbox-capture' },
  { id: 'pane-1', noteId: 'note-02-target-pain' },
  { id: 'pane-2', noteId: null },
  { id: 'pane-3', noteId: null },
];
