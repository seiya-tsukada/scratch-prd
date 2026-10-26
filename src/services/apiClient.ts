import {
  API_ENDPOINTS,
  GeneratePrdRequest,
  GeneratePrdResponse,
  StructureRoughNoteRequest,
  StructureRoughNoteResponse,
} from '../config/api';

/** サーバーが入力を拒否したときの表示文言（入力上限は画面側でも事前に確認している） */
const STATUS_MESSAGES: Record<number, string> = {
  413: '送信するデータが大きすぎます。メモの数や文字数を減らしてください。',
  422: '入力内容が上限を超えているか、形式が正しくありません。メモの数や文字数を確認してください。',
};

async function postJson<TResponse>(url: string, body: unknown, errorPrefix: string): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(STATUS_MESSAGES[response.status] ?? `${errorPrefix}: ${response.statusText}`);
  }

  return response.json();
}

export const generatePrd = (payload: GeneratePrdRequest) =>
  postJson<GeneratePrdResponse>(API_ENDPOINTS.GENERATE_PRD, payload, 'AI生成サーバーエラー');

export const structureRoughNote = (payload: StructureRoughNoteRequest) =>
  postJson<StructureRoughNoteResponse>(API_ENDPOINTS.STRUCTURE_ROUGH_NOTE, payload, 'サーバーエラー');
