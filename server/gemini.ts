import { GoogleGenAI } from '@google/genai';
import { GEMINI_CONFIG } from './config';

/** API キーが設定されていれば Gemini クライアントを返す */
export function getAiClient(): GoogleGenAI | null {
  return GEMINI_CONFIG.apiKey ? new GoogleGenAI({ apiKey: GEMINI_CONFIG.apiKey }) : null;
}

/**
 * JSON 出力を指定してプロンプトを実行し、パース結果を返す。
 * 応答が純粋な JSON でない場合は最初の {...} を抜き出して再パースし、それも無ければ undefined。
 */
export async function generateJson<T>(ai: GoogleGenAI, prompt: string): Promise<T | undefined> {
  const response = await ai.models.generateContent({
    model: GEMINI_CONFIG.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: GEMINI_CONFIG.temperature,
    },
  });

  const responseText = response.text || '';
  try {
    return JSON.parse(responseText);
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : undefined;
  }
}
