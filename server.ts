import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

// Helper to get GoogleGenAI client if API key is present
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

interface NoteInput {
  id: string;
  title: string;
  content: string;
  sectionName?: string;
}

interface PrdGeneratePayload {
  projectName: string;
  mode: 'strict' | 'suggest' | 'expand';
  detailLevel: 'brief' | 'standard' | 'detailed';
  notes: NoteInput[];
  existingPrd?: string;
}

// Fallback high-quality structured PRD generator when API key is missing or offline
function generateMockPrd(payload: PrdGeneratePayload) {
  const { projectName, mode, detailLevel, notes, existingPrd } = payload;
  const isStrict = mode === 'strict';
  const isExpand = mode === 'expand';

  const facts = notes.map((n, i) => ({
    id: `fact-${i + 1}`,
    text: n.title ? `${n.title}: ${n.content.slice(0, 100).replace(/\n/g, ' ')}` : n.content.slice(0, 100),
    sourceNoteId: n.id,
    sourceNoteTitle: n.title || '無題のメモ',
  }));

  const proposals = isStrict
    ? []
    : [
        {
          id: 'prop-1',
          category: 'データ整合性',
          title: 'ノート変更とPRDのバージョン履歴管理',
          description: 'PRDを再生成する際、過去のPRDを破壊せず履歴として保持し差分比較できるようにする',
          impact: 'high' as const,
        },
        {
          id: 'prop-2',
          category: 'UX / エディタ',
          title: 'クイックキャプチャ用キーボードショートカット (Cmd+K / Cmd+N)',
          description: 'どの画面にいても瞬時にInboxへメモを追加できるホットキーを提供',
          impact: 'medium' as const,
        },
        ...(isExpand
          ? [
              {
                id: 'prop-3',
                category: 'AI / 拡張構想',
                title: 'Cursor & Claude Code向けプロンプト形式プリセット生成',
                description: '生成した仕様をAIエージェントにそのまま投入できる形式でワンクリック出力',
                impact: 'high' as const,
              },
              {
                id: 'prop-4',
                category: 'プロダクト検証',
                title: '初期KPI：メモ作成から7日後の再訪率とPRD出力数',
                description: '思考の定着度と実際の開発移行率を測定する指標ダッシュボードの設置',
                impact: 'medium' as const,
              },
            ]
          : []),
      ];

  const openQuestions = [
    {
      id: 'oq-1',
      question: 'ペイン間のメモドラッグ＆ドロップ配置のサポート優先度',
      context: 'MVPではドロップダウン切り替えで十分か、初期からドラッグ操作を提供するか',
      urgency: 'normal' as const,
    },
    {
      id: 'oq-2',
      question: 'オフライン時の同期競合解決ポリシー',
      context: '複数端末で同時編集された場合、ラストライト優先かマージダイアログを表示するか',
      urgency: 'critical' as const,
    },
  ];

  const contradictions = notes.length > 3
    ? []
    : [];

  const modeBadge =
    mode === 'strict'
      ? '【厳密モード (Strict)】メモ記載の事実のみで構成。推測・追加なし'
      : mode === 'suggest'
      ? '【整理・提案モード (Organize & Suggest)】原文の意図を整理し、不足部分に提案ラベルを付与'
      : '【仮説拡張モード (Expand)】KPI・リスク・将来機能まで仮説として積極提案';

  const markdown = `# ${projectName || 'Idea Workspace'} — Product Requirements Document (PRD)

> 生成モード: **${modeBadge}**  
> 詳細度: **${detailLevel === 'brief' ? '簡易' : detailLevel === 'detailed' ? '詳細' : '標準'}**  
> 参照ノート数: **${notes.length}件** | 作成日時: **${new Date().toLocaleString('ja-JP')}**

---

## 1. プロダクト概要 (Product Overview)
${projectName} は、散逸しがちな開発者の思いつきや断片的なメモを逃さず、開発・検証可能な構造化PRDへと育てるためのワークスペースである。
ユーザーが思考を止めずに素早く記録し、AIが事実と仮説を区別しながら実装可能な仕様書を自動構成する。

---

## 2. 課題と背景 (Background & Problem)
### 原文ノートに基づく確認事項 [FACT]
${notes
  .map(
    (n) => `- **${n.title || '無題のメモ'}**: ${n.content.split('\n')[0].replace(/^#+\s*/, '')}`
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
    contradictions,
    sourceNoteIds: notes.map((n) => n.id),
  };
}

// Fast Rough Note to PRD-style Structured Text Endpoint
app.post('/api/structure-rough-note', async (req: Request, res: Response) => {
  try {
    const { title, content, projectName } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const ai = getAiClient();

    // Fallback if no AI key configured or network error
    if (!ai) {
      const lines = content.trim().split('\n').filter(Boolean);
      const heading = title?.trim() || lines[0]?.replace(/^#+\s*/, '') || '機能アイデア仕様';
      const structuredContent = `# ${heading}

## 1. 概要 (Overview)
${lines.slice(0, 2).join(' ')}

## 2. 解決する課題・背景 (Problem & Context)
- ${lines.slice(0, 3).map((l) => l.replace(/^[-*•]\s*/, '')).join('\n- ')}

## 3. 主要要件・コア仕様 (Key Requirements)
- [ ] ${lines.map((l) => l.replace(/^[-*•]\s*/, '')).join('\n- [ ] ')}

## 4. UI / 実装メモ (Implementation Ideas)
- 思考の断片から抽出された要件を実装ベースに落とし込む
- 不要な複雑さを避け、MVPスコープに収める

## 5. 未解決事項・メモ (Open Questions)
- ❓ 具体的な受け入れ基準・エッジケースの確認が必要`;

      return res.json({
        structuredTitle: heading,
        structuredContent,
      });
    }

    const prompt = `You are a product manager specializing in transforming rough, messy scribbles into clean PRD-style markdown notes.

Project: ${projectName || 'Idea Workspace'}
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '';
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (parsed?.structuredContent) {
      return res.json({
        structuredTitle: parsed.structuredTitle || title || '構造化PRDメモ',
        structuredContent: parsed.structuredContent,
      });
    }

    throw new Error('Could not parse response');
  } catch (err: any) {
    console.error('Error in structure-rough-note:', err);
    // Return structured fallback so user is never blocked
    const fallbackTitle = req.body.title || '構造化メモ';
    const fallbackContent = `# ${fallbackTitle}\n\n## 1. 概要\n${req.body.content}\n\n## 2. 主要要件\n- [ ] 要件の具体化\n- [ ] 実装スコープの確定`;
    return res.json({
      structuredTitle: fallbackTitle,
      structuredContent: fallbackContent,
    });
  }
});

// PRD Generation Endpoint (Optimized for speed)
app.post('/api/generate-prd', async (req: Request, res: Response) => {
  try {
    const payload: PrdGeneratePayload = req.body;
    const { projectName, mode, detailLevel, notes, existingPrd } = payload;

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'At least one note is required to generate a PRD.' });
    }

    const ai = getAiClient();

    // If no API key configured or fallback requested, use structured mock
    if (!ai) {
      console.log('Gemini API key not configured. Using high-fidelity mock generator.');
      const mockResult = generateMockPrd(payload);
      return res.json(mockResult);
    }

    // Prepare prompt according to PRD Section 6 rules
    const notesContent = notes
      .map(
        (n, index) =>
          `[Note #${index + 1}] ID: ${n.id} | Section: ${n.sectionName || 'General'} | Title: ${n.title || '(無題)'}\nContent:\n${n.content}\n`
      )
      .join('\n---\n');

    const modeInstructions = {
      strict: `【Mode A: 厳密 (Strict)】
- 元のメモに記載された情報のみを使用。推測・追加なし。不足は「未定」「要確認」と明記。proposals配列は空にすること。`,
      suggest: `【Mode B: 整理＆提案 (Suggest) - 推奨】
- 原文を整理し、不足部分に提案ラベルをつけてproposalsに含めること。`,
      expand: `【Mode C: 仮説拡張 (Expand)】
- 機能案、KPI候補、リスク、検証方法まで仮説として積極的にproposalsへ拡張すること。`,
    }[mode || 'suggest'];

    const detailInstructions = {
      brief: '要点を絞ったコンパクトなPRD',
      standard: '実践的で明確な標準PRD',
      detailed: '詳細な開発仕様PRD',
    }[detailLevel || 'standard'];

    const systemPrompt = `You are a senior product manager. Transform fragmented user notes into a clear, concise, actionable Product Requirements Document (PRD) in Japanese.
Rules:
1. Treat user notes as primary truth. Never invent business facts or budgets.
2. Distinguish confirmed facts, AI proposals, and open questions.
3. Be high-density, crisp, and direct. Avoid unnecessary fluff to maximize generation speed.

Project: ${projectName}
Mode: ${modeInstructions}
Detail: ${detailInstructions}
${existingPrd ? `Previous PRD Reference:\n${existingPrd.slice(0, 1000)}` : ''}`;

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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '';
    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseErr) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON format returned by AI');
      }
    }

    return res.json({
      markdown: parsedData.markdown || '# 生成されたPRD\n\n内容を生成しました。',
      facts: parsedData.facts || [],
      proposals: parsedData.proposals || [],
      openQuestions: parsedData.openQuestions || [],
      contradictions: parsedData.contradictions || [],
      sourceNoteIds: notes.map((n) => n.id),
    });
  } catch (error: any) {
    console.error('Error generating PRD with Gemini:', error);
    const fallback = generateMockPrd(req.body);
    return res.json({
      ...fallback,
      _fallbackNotice: 'AIサービスの一時的な通信エラーのため、内蔵ジェネレータで構成しました。',
    });
  }
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Start server
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
