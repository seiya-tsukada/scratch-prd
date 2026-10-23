import {
  API_ENDPOINTS,
  GeneratePrdRequest,
  GeneratePrdResponse,
  StructureRoughNoteRequest,
  StructureRoughNoteResponse,
} from '../config/api';

async function postJson<TResponse>(url: string, body: unknown, errorPrefix: string): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${errorPrefix}: ${response.statusText}`);
  }

  return response.json();
}

export const generatePrd = (payload: GeneratePrdRequest) =>
  postJson<GeneratePrdResponse>(API_ENDPOINTS.GENERATE_PRD, payload, 'AI生成サーバーエラー');

export const structureRoughNote = (payload: StructureRoughNoteRequest) =>
  postJson<StructureRoughNoteResponse>(API_ENDPOINTS.STRUCTURE_ROUGH_NOTE, payload, 'サーバーエラー');
