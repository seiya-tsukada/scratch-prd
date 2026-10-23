import dotenv from 'dotenv';

dotenv.config();

/** .env.example に記載しているプレースホルダー。この値のままなら未設定とみなす */
const GEMINI_API_KEY_PLACEHOLDER = 'MY_GEMINI_API_KEY';

const rawApiKey = process.env.GEMINI_API_KEY;

export const SERVER_CONFIG = {
  port: Number(process.env.PORT) || 3000,
  host: '0.0.0.0',
  isProduction: process.env.NODE_ENV === 'production',
  jsonBodyLimit: '10mb',
  distDir: 'dist',
} as const;

export const GEMINI_CONFIG = {
  apiKey: rawApiKey && rawApiKey !== GEMINI_API_KEY_PLACEHOLDER ? rawApiKey : null,
  model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  temperature: 0.2,
} as const;

/** PRD 再生成時にプロンプトへ含める既存PRDの最大文字数 */
export const EXISTING_PRD_CONTEXT_MAX_CHARS = 1000;

/** フォールバック PRD で各メモから抜き出す本文の最大文字数 */
export const MOCK_FACT_MAX_CHARS = 100;

export const DEFAULT_PROJECT_NAME = 'Idea Workspace';
