import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { SERVER_CONFIG } from './server/config';
import { generateJson, getAiClient } from './server/gemini';
import { buildGeneratePrdPrompt, buildStructureRoughNotePrompt } from './server/prompts';
import {
  DEFAULT_STRUCTURED_TITLE,
  FALLBACK_PRD_MARKDOWN,
  buildRoughNoteErrorFallback,
  generateMockPrd,
  structureRoughNoteLocally,
} from './server/fallbacks';
import {
  API_ENDPOINTS,
  FallbackReason,
  GeneratePrdRequest,
  GeneratePrdResponse,
  StructureRoughNoteResponse,
} from './src/config/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Python 版（backend/app/routers/ai.py）と同じく、内蔵ジェネレータで応答したことを明示する
const fallbackMeta = (fallbackReason: FallbackReason) => ({ usedFallback: true, fallbackReason });

const app = express();
app.use(express.json({ limit: SERVER_CONFIG.jsonBodyLimit }));

// 殴り書きメモを PRD 風の構造化テキストに整形
app.post(API_ENDPOINTS.STRUCTURE_ROUGH_NOTE, async (req: Request, res: Response) => {
  try {
    const { title, content, projectName } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.json({ ...structureRoughNoteLocally({ title, content }), ...fallbackMeta('no_api_key') });
    }

    const parsed = await generateJson<Partial<StructureRoughNoteResponse>>(
      ai,
      buildStructureRoughNotePrompt({ title, content, projectName })
    );

    if (parsed?.structuredContent) {
      return res.json({
        structuredTitle: parsed.structuredTitle || title || DEFAULT_STRUCTURED_TITLE,
        structuredContent: parsed.structuredContent,
        usedFallback: false,
      });
    }

    throw new Error('Could not parse response');
  } catch (err: any) {
    console.error('Error in structure-rough-note:', err);
    // ユーザーの作業を止めないよう、エラー時も最低限の構造で返す
    return res.json({ ...buildRoughNoteErrorFallback(req.body), ...fallbackMeta('ai_error') });
  }
});

// 複数メモから PRD を生成
app.post(API_ENDPOINTS.GENERATE_PRD, async (req: Request, res: Response) => {
  try {
    const payload: GeneratePrdRequest = req.body;
    const { notes } = payload;

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'At least one note is required to generate a PRD.' });
    }

    const ai = getAiClient();
    if (!ai) {
      console.log('Gemini API key not configured. Using high-fidelity mock generator.');
      return res.json({ ...generateMockPrd(payload), ...fallbackMeta('no_api_key') });
    }

    const parsedData = await generateJson<Partial<GeneratePrdResponse>>(ai, buildGeneratePrdPrompt(payload));
    if (!parsedData) {
      throw new Error('Invalid JSON format returned by AI');
    }

    return res.json({
      markdown: parsedData.markdown || FALLBACK_PRD_MARKDOWN,
      facts: parsedData.facts || [],
      proposals: parsedData.proposals || [],
      openQuestions: parsedData.openQuestions || [],
      contradictions: parsedData.contradictions || [],
      sourceNoteIds: notes.map((n) => n.id),
      usedFallback: false,
    });
  } catch (error: any) {
    console.error('Error generating PRD with Gemini:', error);
    return res.json({
      ...generateMockPrd(req.body),
      ...fallbackMeta('ai_error'),
    });
  }
});

app.get(API_ENDPOINTS.HEALTH, (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

async function startServer() {
  if (!SERVER_CONFIG.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, SERVER_CONFIG.distDir);
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
    console.log(`Server listening on http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
  });
}

startServer();
