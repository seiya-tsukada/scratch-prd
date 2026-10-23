/**
 * Gemini API が使えない（キー未設定・通信エラー・応答不正）場合の内蔵ジェネレータ。
 */
import type {
  GeneratePrdRequest,
  GeneratePrdResponse,
  StructureRoughNoteRequest,
  StructureRoughNoteResponse,
} from '../src/config/api';
import type { PrdGenerationMode, PrdOpenQuestion, PrdProposal } from '../src/types';
import { DATE_LOCALE, UNTITLED_NOTE_LABEL } from '../src/config/app';
import { getDetailLevelLabel } from '../src/config/prd';
import { DEFAULT_PROJECT_NAME, MOCK_FACT_MAX_CHARS } from './config';

export const DEFAULT_ROUGH_NOTE_HEADING = '機能アイデア仕様';
export const DEFAULT_STRUCTURED_TITLE = '構造化PRDメモ';
const ERROR_FALLBACK_TITLE = '構造化メモ';
export const FALLBACK_PRD_MARKDOWN = '# 生成されたPRD\n\n内容を生成しました。';
export const AI_ERROR_FALLBACK_NOTICE = 'AIサービスの一時的な通信エラーのため、内蔵ジェネレータで構成しました。';

const MODE_BADGES: Record<PrdGenerationMode, string> = {
  strict: '【厳密モード (Strict)】メモ記載の事実のみで構成。推測・追加なし',
  suggest: '【整理・提案モード (Organize & Suggest)】原文の意図を整理し、不足部分に提案ラベルを付与',
  expand: '【仮説拡張モード (Expand)】KPI・リスク・将来機能まで仮説として積極提案',
};

const BASE_PROPOSALS: PrdProposal[] = [
  {
    id: 'prop-1',
    category: 'データ整合性',
    title: 'ノート変更とPRDのバージョン履歴管理',
    description: 'PRDを再生成する際、過去のPRDを破壊せず履歴として保持し差分比較できるようにする',
    impact: 'high',
  },
  {
    id: 'prop-2',
    category: 'UX / エディタ',
    title: 'クイックキャプチャ用キーボードショートカット (Cmd+K / Cmd+N)',
    description: 'どの画面にいても瞬時にInboxへメモを追加できるホットキーを提供',
    impact: 'medium',
  },
];

const EXPAND_PROPOSALS: PrdProposal[] = [
  {
    id: 'prop-3',
    category: 'AI / 拡張構想',
    title: 'Cursor & Claude Code向けプロンプト形式プリセット生成',
    description: '生成した仕様をAIエージェントにそのまま投入できる形式でワンクリック出力',
    impact: 'high',
  },
  {
    id: 'prop-4',
    category: 'プロダクト検証',
    title: '初期KPI：メモ作成から7日後の再訪率とPRD出力数',
    description: '思考の定着度と実際の開発移行率を測定する指標ダッシュボードの設置',
    impact: 'medium',
  },
];

const MOCK_OPEN_QUESTIONS: PrdOpenQuestion[] = [
  {
    id: 'oq-1',
    question: 'ペイン間のメモドラッグ＆ドロップ配置のサポート優先度',
    context: 'MVPではドロップダウン切り替えで十分か、初期からドラッグ操作を提供するか',
    urgency: 'normal',
  },
  {
    id: 'oq-2',
    question: 'オフライン時の同期競合解決ポリシー',
    context: '複数端末で同時編集された場合、ラストライト優先かマージダイアログを表示するか',
    urgency: 'critical',
  },
];

const firstLineOf = (content: string) => content.split('\n')[0].replace(/^#+\s*/, '');
const stripBullet = (line: string) => line.replace(/^[-*•]\s*/, '');

/** キー未設定時・AIエラー時に返す構造化済み PRD */
export function generateMockPrd(payload: GeneratePrdRequest): GeneratePrdResponse {
  const { projectName, mode, detailLevel, notes } = payload;
  const isStrict = mode === 'strict';
  const isExpand = mode === 'expand';

  const facts = notes.map((n, i) => ({
    id: `fact-${i + 1}`,
    text: n.title
      ? `${n.title}: ${n.content.slice(0, MOCK_FACT_MAX_CHARS).replace(/\n/g, ' ')}`
      : n.content.slice(0, MOCK_FACT_MAX_CHARS),
    sourceNoteId: n.id,
    sourceNoteTitle: n.title || UNTITLED_NOTE_LABEL,
  }));

  const proposals = isStrict ? [] : [...BASE_PROPOSALS, ...(isExpand ? EXPAND_PROPOSALS : [])];
  const openQuestions = MOCK_OPEN_QUESTIONS;
  const modeBadge = MODE_BADGES[mode] ?? MODE_BADGES.expand;

  const markdown = `# ${projectName || DEFAULT_PROJECT_NAME} — Product Requirements Document (PRD)

> 生成モード: **${modeBadge}**  
> 詳細度: **${getDetailLevelLabel(detailLevel)}**  
> 参照ノート数: **${notes.length}件** | 作成日時: **${new Date().toLocaleString(DATE_LOCALE)}**

---

## 1. プロダクト概要 (Product Overview)
${projectName} は、散逸しがちな開発者の思いつきや断片的なメモを逃さず、開発・検証可能な構造化PRDへと育てるためのワークスペースである。
ユーザーが思考を止めずに素早く記録し、AIが事実と仮説を区別しながら実装可能な仕様書を自動構成する。

---

## 2. 課題と背景 (Background & Problem)
### 原文ノートに基づく確認事項 [FACT]
${notes
  .map(
    (n) => `- **${n.title || UNTITLED_NOTE_LABEL}**: ${firstLineOf(n.content)}`
  )
  .join('\n')}

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

${
  !isStrict
    ? `---

## 6. AI提案と推奨設計 [PROPOSAL]
${proposals.map((p) => `- **[${p.category}] ${p.title}** (重要度: ${p.impact}): ${p.description}`).join('\n')}
`
    : ''
}
---

## 7. 未解決の論点 (Open Questions) [OPEN_QUESTION]
${openQuestions.map((q) => `- ❓ **${q.question}**: ${q.context} (緊急度: ${q.urgency})`).join('\n')}

---

## 8. 将来のロードマップ (Future Roadmap)
- [ ] AIコーディングツール（Cursor, Claude Code, Windsurf）専用プロンプト出力
- [ ] PRDのバージョン間差分ビジュアライザー
- [ ] Supabase Auth & PostgreSQLによる完全クラウド同期
`;

  return {
    markdown,
    facts,
    proposals,
    openQuestions,
    contradictions: [],
    sourceNoteIds: notes.map((n) => n.id),
  };
}

/** キー未設定時に、メモの行をそのまま PRD 形式の見出しへ割り振る */
export function structureRoughNoteLocally({ title, content }: StructureRoughNoteRequest): StructureRoughNoteResponse {
  const lines = content.trim().split('\n').filter(Boolean);
  const heading = title?.trim() || lines[0]?.replace(/^#+\s*/, '') || DEFAULT_ROUGH_NOTE_HEADING;
  const structuredContent = `# ${heading}

## 1. 概要 (Overview)
${lines.slice(0, 2).join(' ')}

## 2. 解決する課題・背景 (Problem & Context)
- ${lines.slice(0, 3).map(stripBullet).join('\n- ')}

## 3. 主要要件・コア仕様 (Key Requirements)
- [ ] ${lines.map(stripBullet).join('\n- [ ] ')}

## 4. UI / 実装メモ (Implementation Ideas)
- 思考の断片から抽出された要件を実装ベースに落とし込む
- 不要な複雑さを避け、MVPスコープに収める

## 5. 未解決事項・メモ (Open Questions)
- ❓ 具体的な受け入れ基準・エッジケースの確認が必要`;

  return { structuredTitle: heading, structuredContent };
}

/** AI 呼び出しが失敗したときに最低限の構造で返す */
export function buildRoughNoteErrorFallback(body: Partial<StructureRoughNoteRequest>): StructureRoughNoteResponse {
  const fallbackTitle = body.title || ERROR_FALLBACK_TITLE;
  const fallbackContent = `# ${fallbackTitle}\n\n## 1. 概要\n${body.content}\n\n## 2. 主要要件\n- [ ] 要件の具体化\n- [ ] 実装スコープの確定`;
  return { structuredTitle: fallbackTitle, structuredContent: fallbackContent };
}
